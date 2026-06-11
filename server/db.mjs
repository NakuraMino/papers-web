// Data layer (multi-conference).
//
// Two kinds of state, stored very differently:
//   - The papers corpus (data/<id>/papers.json) is read-only and ships with the
//     app. It's loaded into memory here, so it costs nothing to host and needs
//     no database.
//   - Your swipe decisions are the only thing that changes, so they live in
//     Supabase (Postgres). That's what makes "resume where you left off" work on
//     a stateless serverless host like Vercel.
//
// Every query/write that touches decisions is async (it hits Supabase).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listConferences, getConference } from '../config/conferences.mjs';
import { supabase } from './supabase.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', 'data');

// --- in-memory papers corpus -------------------------------------------------
// CORPUS[conf] = { list: paper[] (ordered by ord), byId: Map<id, paper> }
const CORPUS = {};

function loadCorpus() {
  for (const conf of listConferences()) {
    const file = join(DATA_DIR, conf.id, 'papers.json');
    if (!existsSync(file)) continue;

    const rows = JSON.parse(readFileSync(file, 'utf8'));
    const list = rows
      .map((p, i) => ({
        conference: conf.id,
        id: String(p.id),
        title: p.title || '',
        authors: p.authors || '',
        keywords: p.keywords || '',
        abstract: p.abstract || '',
        session: p.session || '',
        day: p.day || '',
        time: p.time || '',
        url: p.url || '',
        pdf_url: p.pdfUrl || p.pdf_url || '',
        arxiv_url: p.arxivUrl || p.arxiv_url || '',
        doi: p.doi || '',
        ord: Number.isFinite(p.ord) ? p.ord : i,
      }))
      .sort((a, b) => a.ord - b.ord);
    // Lowercased title+keywords+abstract per paper, for fast keyword-filter
    // matching. Kept in a side map so it never leaks into API responses.
    const hay = new Map(list.map((p) => [p.id, `${p.title} ${p.keywords} ${p.abstract}`.toLowerCase()]));
    CORPUS[conf.id] = { list, byId: new Map(list.map((p) => [p.id, p])), hay };
  }
}
loadCorpus();

const corpusOf = (conf) => CORPUS[conf] || { list: [], byId: new Map(), hay: new Map() };

// Conference ids that actually have papers loaded (sync; for startup logging).
export const loadedConferences = () => Object.keys(CORPUS);

// --- decisions (Supabase) ----------------------------------------------------

// All decision rows for a conference, keyed by paper_id.
async function decisionsMap(conference) {
  const { data, error } = await supabase.from('decisions').select('*').eq('conference', conference);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((d) => [d.paper_id, d]));
}

const nextSeq = async (conference) => {
  const { data, error } = await supabase
    .from('decisions')
    .select('seq')
    .eq('conference', conference)
    .order('seq', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data && data[0] && data[0].seq) || 0) + 1;
};

// --- keyword filters (Supabase) ---------------------------------------------
// Per-conference terms; a paper is hidden if any term is a substring of its
// title/keywords/abstract. Reads degrade to "no filters" if the table doesn't
// exist yet, so the app keeps working before the filters table is created.

export async function getFilters(conference) {
  const { data, error } = await supabase.from('filters').select('term').eq('conference', conference);
  if (error) {
    console.warn(`[filters] read failed (is the "filters" table created?): ${error.message}`);
    return [];
  }
  return (data || []).map((r) => r.term);
}

// Replace the whole filter set for a conference (add/edit/remove all funnel here).
export async function setFilters(conference, terms) {
  const seen = new Set();
  const clean = [];
  for (const t of terms || []) {
    const s = String(t).trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(s);
  }
  const del = await supabase.from('filters').delete().eq('conference', conference);
  if (del.error) throw new Error(del.error.message);
  if (clean.length) {
    const ins = await supabase.from('filters').insert(clean.map((term) => ({ conference, term })));
    if (ins.error) throw new Error(ins.error.message);
  }
  return clean;
}

// terms must be pre-lowercased.
const matchesFilters = (conference, paperId, terms) => {
  if (!terms.length) return false;
  const hay = corpusOf(conference).hay.get(paperId) || '';
  return terms.some((t) => hay.includes(t));
};

const lowerFilters = async (conference) => (await getFilters(conference)).map((t) => t.toLowerCase());

// Merge a paper with its decision row into the shape the frontend expects.
function withDecision(p, d) {
  return {
    ...p,
    decision: d ? d.decision : null,
    decided_at: d ? d.decided_at : null,
    read: d && d.read ? 1 : 0,
    read_at: d ? d.read_at : null,
    seq: d ? d.seq : 0,
  };
}

// --- conference catalog ------------------------------------------------------

// Conferences that have papers loaded, with display name + stats.
export async function conferenceCatalog() {
  const out = [];
  for (const c of listConferences()) {
    if (corpusOf(c.id).list.length === 0) continue;
    out.push({ id: c.id, name: c.name, venue: c.venue, stats: await stats(c.id) });
  }
  return out;
}

// --- queries (all scoped to a conference) ------------------------------------

export async function stats(conference) {
  const { list } = corpusOf(conference);
  const total = list.length;
  const { data, error } = await supabase.from('decisions').select('paper_id, decision').eq('conference', conference);
  if (error) throw new Error(error.message);
  const rows = data || [];
  const byKind = rows.reduce((acc, r) => ((acc[r.decision] = (acc[r.decision] || 0) + 1), acc), {});
  const decided = rows.length;

  // Count undecided papers hidden by the keyword filters.
  const decidedSet = new Set(rows.map((r) => r.paper_id));
  const terms = await lowerFilters(conference);
  let filtered = 0;
  if (terms.length) {
    for (const p of list) {
      if (!decidedSet.has(p.id) && matchesFilters(conference, p.id, terms)) filtered++;
    }
  }

  return {
    total,
    decided,
    remaining: total - decided - filtered, // swipeable: undecided and not hidden
    filtered,
    liked: byKind.like || 0,
    disliked: byKind.dislike || 0,
    skipped: byKind.skip || 0,
  };
}

export async function nextUndecided(conference) {
  const { list } = corpusOf(conference);
  const decided = await decisionsMap(conference);
  const terms = await lowerFilters(conference);
  for (const p of list) {
    if (decided.has(p.id)) continue;
    if (matchesFilters(conference, p.id, terms)) continue; // hidden by a keyword filter
    return p;
  }
  return null;
}

export async function recordDecision(conference, paperId, decision, note = '') {
  const id = String(paperId);
  if (!corpusOf(conference).byId.has(id)) throw new Error(`unknown paper: ${conference}/${id}`);
  const seq = await nextSeq(conference);
  // Re-deciding an existing paper updates decision/decided_at/seq/note but leaves
  // read/read_at untouched (they're not in the payload), matching the old schema.
  const { error } = await supabase.from('decisions').upsert(
    { conference, paper_id: id, decision, decided_at: new Date().toISOString(), seq, note },
    { onConflict: 'conference,paper_id' },
  );
  if (error) throw new Error(error.message);
}

export async function undoLast(conference) {
  const { data, error } = await supabase
    .from('decisions')
    .select('*')
    .eq('conference', conference)
    .order('seq', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const last = data && data[0];
  if (!last) return null;
  const { error: delErr } = await supabase
    .from('decisions')
    .delete()
    .eq('conference', conference)
    .eq('paper_id', last.paper_id);
  if (delErr) throw new Error(delErr.message);
  return corpusOf(conference).byId.get(last.paper_id) || null;
}

// Mark a decided paper as read / unread. Returns false if the paper isn't decided.
export async function setRead(conference, paperId, read) {
  const { data, error } = await supabase
    .from('decisions')
    .update({ read: !!read, read_at: read ? new Date().toISOString() : null })
    .eq('conference', conference)
    .eq('paper_id', String(paperId))
    .select('paper_id');
  if (error) throw new Error(error.message);
  return (data || []).length > 0;
}

export async function setDecisionOrClear(conference, paperId, decision) {
  if (decision === null || decision === 'undecided') {
    const { error } = await supabase
      .from('decisions')
      .delete()
      .eq('conference', conference)
      .eq('paper_id', String(paperId));
    if (error) throw new Error(error.message);
    return;
  }
  await recordDecision(conference, paperId, decision);
}

export async function listPapers(conference, { status = 'like', q = '' } = {}) {
  const { list } = corpusOf(conference);
  const decided = await decisionsMap(conference);
  const needle = q.trim().toLowerCase();
  const matches = (p) =>
    !needle ||
    p.title.toLowerCase().includes(needle) ||
    p.authors.toLowerCase().includes(needle) ||
    p.keywords.toLowerCase().includes(needle) ||
    p.abstract.toLowerCase().includes(needle);

  // 'undecided' hides keyword-filtered papers (matching the swipe queue);
  // 'filtered' shows exactly those hidden papers so you can review them.
  const terms = status === 'undecided' || status === 'filtered' ? await lowerFilters(conference) : [];

  if (status === 'filtered') {
    return list
      .filter((p) => !decided.has(p.id) && matchesFilters(conference, p.id, terms) && matches(p))
      .map((p) => withDecision(p, null));
  }
  if (status === 'all') {
    return list.filter(matches).map((p) => withDecision(p, decided.get(p.id)));
  }
  if (status === 'undecided') {
    return list
      .filter((p) => !decided.has(p.id) && !matchesFilters(conference, p.id, terms) && matches(p))
      .map((p) => withDecision(p, null));
  }
  // like | dislike | skip -> only decided papers of that kind, newest first.
  return list
    .filter((p) => decided.get(p.id)?.decision === status && matches(p))
    .map((p) => withDecision(p, decided.get(p.id)))
    .sort((a, b) => (b.seq || 0) - (a.seq || 0));
}

export async function allDecisionsForExport(conference) {
  const { byId } = corpusOf(conference);
  const { data, error } = await supabase
    .from('decisions')
    .select('*')
    .eq('conference', conference)
    .order('seq', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((d) => {
    const p = byId.get(d.paper_id) || {};
    return {
      conference: d.conference,
      id: d.paper_id,
      title: p.title || '',
      authors: p.authors || '',
      keywords: p.keywords || '',
      session: p.session || '',
      day: p.day || '',
      time: p.time || '',
      url: p.url || '',
      pdf_url: p.pdf_url || '',
      arxiv_url: p.arxiv_url || '',
      doi: p.doi || '',
      decision: d.decision,
      decided_at: d.decided_at,
      read: d.read ? 1 : 0,
      read_at: d.read_at || '',
    };
  });
}

export { getConference };
