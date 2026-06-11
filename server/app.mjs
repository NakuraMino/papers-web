// Express app for the paper swiper (multi-conference). Exported without calling
// .listen() so it can run two ways:
//   - locally:  server/index.mjs imports it and listens on a port
//   - on Vercel: api/[...slug].mjs mounts it as a serverless function
//
//   GET  /api/conferences            -> list loaded conferences + stats
//   GET  /api/:conf/next             -> next undecided paper + stats
//   GET  /api/:conf/stats            -> counts
//   POST /api/:conf/decision         -> { paperId, decision: like|dislike|skip }
//   POST /api/:conf/undo             -> revert the most recent decision
//   POST /api/:conf/set              -> { paperId, decision|null }  (Liked-view un-like)
//   POST /api/:conf/read             -> { paperId, read: boolean }
//   GET  /api/:conf/papers?status=&q=-> browse (like|dislike|skip|undecided|all) + search
//   GET  /api/:conf/export.csv       -> download decisions as CSV
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import {
  conferenceCatalog, getConference, stats, nextUndecided,
  recordDecision, undoLast, setDecisionOrClear, setRead, listPapers,
  allDecisionsForExport, loadedConferences, getFilters, setFilters,
} from './db.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = join(HERE, '..', 'web', 'dist');
const VALID = new Set(['like', 'dislike', 'skip']);

// Reads are public. Writes (recording/clearing decisions, undo, mark-read) require
// the edit password, supplied as the `x-edit-code` header. If ADMIN_CODE is unset,
// editing is locked for everyone — safe by default, so the site never ships
// world-writable by accident. Set ADMIN_CODE locally (.env.local) and on Vercel.
const ADMIN_CODE = process.env.ADMIN_CODE || '';
const EDIT_ENABLED = ADMIN_CODE.length > 0;

console.log(`[db] conferences loaded: ${loadedConferences().join(', ') || '(none — run npm run scrape)'}`);
console.log(`[auth] editing ${EDIT_ENABLED ? 'requires the edit password (ADMIN_CODE)' : 'is LOCKED — ADMIN_CODE not set'}`);

const app = express();

// Parse JSON bodies. On Vercel the runtime may have already parsed the body into
// req.body; if so, skip re-reading the (consumed) stream. Locally req.body is
// undefined until express.json() runs.
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') return next();
  return express.json()(req, res, next);
});

// Wrap an async handler so thrown/rejected errors reach the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Gate for write routes. 401 if editing is disabled or the code doesn't match.
const requireEdit = (req, res, next) => {
  if (EDIT_ENABLED && req.get('x-edit-code') === ADMIN_CODE) return next();
  return res.status(401).json({
    error: EDIT_ENABLED ? 'editing locked — unlock with the edit password' : 'editing is disabled on this server',
  });
};

// Lets the UI know whether to show the unlock control at all.
app.get('/api/config', (_req, res) => res.json({ editEnabled: EDIT_ENABLED }));

// Validate a candidate edit password (so the UI can confirm before storing it).
app.post('/api/unlock', wrap(async (req, res) => {
  const { code } = req.body || {};
  if (EDIT_ENABLED && code && code === ADMIN_CODE) return res.json({ ok: true });
  res.status(401).json({ error: EDIT_ENABLED ? 'incorrect edit password' : 'editing is disabled on this server' });
}));

app.get('/api/conferences', wrap(async (_req, res) => {
  res.json({ conferences: await conferenceCatalog() });
}));

// Resolve + validate :conf for every conference-scoped route.
const confRouter = express.Router({ mergeParams: true });
confRouter.use(wrap(async (req, res, next) => {
  const conf = req.params.conf;
  if (!getConference(conf)) return res.status(404).json({ error: `unknown conference: ${conf}` });
  if ((await stats(conf)).total === 0) return res.status(404).json({ error: `conference not loaded: ${conf}` });
  next();
}));

confRouter.get('/stats', wrap(async (req, res) => res.json(await stats(req.params.conf))));

confRouter.get('/next', wrap(async (req, res) => {
  const { conf } = req.params;
  res.json({ paper: await nextUndecided(conf), stats: await stats(conf) });
}));

confRouter.post('/decision', requireEdit, wrap(async (req, res) => {
  const { conf } = req.params;
  const { paperId, decision } = req.body || {};
  if (!paperId || !VALID.has(decision)) {
    return res.status(400).json({ error: 'paperId and decision (like|dislike|skip) required' });
  }
  try {
    await recordDecision(conf, paperId, decision);
  } catch (err) {
    if (/^unknown paper/.test(err.message)) return res.status(404).json({ error: err.message });
    throw err;
  }
  res.json({ paper: await nextUndecided(conf), stats: await stats(conf) });
}));

confRouter.post('/undo', requireEdit, wrap(async (req, res) => {
  const { conf } = req.params;
  const paper = await undoLast(conf);
  res.json({ undone: paper, paper: await nextUndecided(conf), stats: await stats(conf) });
}));

confRouter.post('/set', requireEdit, wrap(async (req, res) => {
  const { conf } = req.params;
  const { paperId, decision } = req.body || {};
  if (!paperId) return res.status(400).json({ error: 'paperId required' });
  if (decision !== null && decision !== 'undecided' && !VALID.has(decision)) {
    return res.status(400).json({ error: 'decision must be like|dislike|skip|null' });
  }
  try {
    await setDecisionOrClear(conf, paperId, decision);
  } catch (err) {
    if (/^unknown paper/.test(err.message)) return res.status(404).json({ error: err.message });
    throw err;
  }
  res.json({ stats: await stats(conf) });
}));

confRouter.post('/read', requireEdit, wrap(async (req, res) => {
  const { conf } = req.params;
  const { paperId, read } = req.body || {};
  if (!paperId || typeof read !== 'boolean') {
    return res.status(400).json({ error: 'paperId and read (boolean) required' });
  }
  const ok = await setRead(conf, paperId, read);
  if (!ok) return res.status(404).json({ error: 'paper is not decided (no decision to mark read)' });
  res.json({ ok: true });
}));

confRouter.get('/filters', wrap(async (req, res) => {
  res.json({ filters: await getFilters(req.params.conf) });
}));

confRouter.post('/filters', requireEdit, wrap(async (req, res) => {
  const { conf } = req.params;
  const { filters } = req.body || {};
  if (!Array.isArray(filters)) return res.status(400).json({ error: 'filters (array of strings) required' });
  const saved = await setFilters(conf, filters);
  res.json({ filters: saved, stats: await stats(conf) });
}));

confRouter.get('/papers', wrap(async (req, res) => {
  const { conf } = req.params;
  const status = String(req.query.status || 'like');
  const q = String(req.query.q || '').trim();
  res.json({ papers: await listPapers(conf, { status, q }), stats: await stats(conf) });
}));

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

confRouter.get('/export.csv', wrap(async (req, res) => {
  const { conf } = req.params;
  const rows = await allDecisionsForExport(conf);
  const cols = ['conference', 'id', 'title', 'decision', 'read', 'decided_at', 'read_at', 'authors', 'keywords', 'session', 'day', 'time', 'url', 'pdf_url', 'arxiv_url', 'doi'];
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${conf}_decisions.csv"`);
  res.send('﻿' + lines.join('\n')); // BOM so Excel reads UTF-8
}));

app.use('/api/:conf', confRouter);

// Serve the built React app for local `npm start`. On Vercel the static site is
// served by Vercel's CDN and this function only ever receives /api/* requests,
// so this block is simply inactive there.
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get('*', (_req, res) => res.sendFile(join(WEB_DIST, 'index.html')));
}

// JSON error handler (keeps the API contract: { error } on failure).
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'server error' });
});

export default app;
