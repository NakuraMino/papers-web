# Paper Swiper

A Tinder-style triage tool for conference papers. Swipe through papers one at a
time (title + abstract), accept / decline / "maybe", and everything you decide is
saved so you can quit and resume anytime. A separate **Liked** tab lets you browse,
search, re-decide, and export your picks to CSV.

Built to handle multiple conferences. Currently wired up:

| Conference | Source | Papers |
| ---------- | ------ | ------ |
| ICRA 2026  | PaperCept | ~2,950 |
| CVPR 2026  | CVF Open Access | ~4,070 |
| CoRL 2025  | OpenReview API | 263 |
| RSS 2025   | roboticsproceedings.org | 163 |

Not yet published as of 2026-06-07 (conference hasn't happened / no abstracts online):
**RSS 2026** (roboticsproceedings rss22 → 404) and **CoRL 2026** (OpenReview venue empty).
They'll work the moment their proceedings go live — just uncomment the entries in
`config/conferences.mjs` and scrape.

---

## Requirements

- **Node 18+** (built/tested on Node 20 via `nvm` inside WSL).
  - This repo lives in WSL Ubuntu. Run all commands in a WSL shell where `node -v`
    shows ≥ 18 (`nvm use 20`). The Windows-side tools here can't reach the
    scrape source over TLS; Node/WSL can.
- **A Supabase project** (free) for your swipe decisions. The papers corpus is
  read-only JSON that ships with the app; only your decisions need a database, so
  the app runs the same locally and on Vercel. See [Hosting](#hosting-supabase--vercel-free).

## Quick start

```bash
npm install                  # root deps (express, @supabase/supabase-js, cheerio)
npm run build:web            # installs web deps + builds the React app

# scrape whichever conferences you want (or `all`):
npm run scrape -- icra2026   # ~2,950 papers
npm run scrape -- corl2025   # 263   (fast: one OpenReview API call)
npm run scrape -- rss2025    # 163   (fetches one page per paper)
npm run scrape -- cvpr2026   # ~4,070 (fetches one page per paper; a few minutes)

# one-time: point at Supabase (see Hosting below) — copy .env.local.example to
# .env.local, fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, and run the schema.
npm start                    # serve on http://localhost:8080
```

Then open **http://localhost:8080** and pick a conference from the dropdown.

> The scrape step is optional if `data/<conf>/papers.json` already exists in the
> repo — those are committed, so a fresh clone can `npm start` right after the
> Supabase setup.

CVPR / CoRL / RSS papers already carry a direct PDF link from their source, so the
optional `enrich` step (below) is only useful for **ICRA** (whose program has no PDF links).

## PDF links

Each paper card shows a link to read the paper:

- **📄 PDF** — a direct link (arXiv PDF, or the DOI/IEEE page) once the paper has
  been *enriched*.
- **🔎 Find PDF** — a title web-search fallback for papers not yet enriched. Always
  available, so you never wait on enrichment to start swiping.

`npm run enrich -- icra2026` resolves direct links via Semantic Scholar's
title-match (≈95% of ICRA papers resolve, mostly to arXiv). It's polite-rate-limited
(~1 req/3.5s → a couple hours for the full program), and **resumable** — stop and
re-run anytime; it only processes papers it hasn't checked. It writes to
`data/<id>/papers.json` only (never the live DB). **Restart the server** to load new
links — the server force-syncs paper metadata from `papers.json` on every startup
(your decisions are never touched).

### Development (hot-reload UI)

```bash
npm run dev              # Express on :8080 + Vite UI on :5173 (proxies /api)
```

Open **http://localhost:5173** while developing.

## Controls

| Action        | Key        | Button | Drag         |
| ------------- | ---------- | ------ | ------------ |
| Accept (like) | →          | ♥      | swipe right  |
| Decline       | ←          | ✕      | swipe left   |
| Maybe / skip  | ↑          | ↑      | swipe up     |
| Undo last     | `z` / `u`  | ↩      | —            |

## Hosting (Supabase + Vercel, free)

Hosted the same way as the world-cup pool: **Supabase** (free Postgres) holds your
swipe decisions, **Vercel** (free) serves the app. Total cost: $0. The Express API
runs as a Vercel serverless function ([`api/[...slug].mjs`](api/[...slug].mjs)); the
papers corpus is bundled into the function as read-only JSON.

**Public read, password to edit.** Anyone with the URL can browse, search, and
export. Recording / changing / undoing swipe decisions requires an edit password
(`ADMIN_CODE`), typed once into the app's **Unlock to edit** box (top right) and
remembered on that device. If `ADMIN_CODE` is unset, editing is locked for everyone
— so the site never ships world-writable by accident.

### 1. Supabase

1. Create a free project at https://supabase.com.
2. **SQL Editor → New query** → paste [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   (Creates the `decisions` table.)
3. **Project Settings → API** → copy the **Project URL** and the **`service_role`**
   secret key.

### 2. Connect locally + migrate your existing swipes

```bash
cp .env.local.example .env.local     # paste SUPABASE_URL + SERVICE_ROLE_KEY + pick an ADMIN_CODE
npm run migrate                      # pushes data/decisions-export.json into Supabase
npm start                            # http://localhost:8080 — verify your picks are there
```

`npm run migrate` is a one-time, idempotent upsert of the decisions exported from
the old local SQLite DB. Skip it if you have no prior swipes to keep.

### 3. Deploy to Vercel

1. Push this repo to GitHub (see below).
2. Import it at https://vercel.com → **New Project**.
3. Add three env vars under **Settings → Environment Variables**:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_CODE` (your edit password).
   Leave build settings as detected — [`vercel.json`](vercel.json) already sets the
   build command, output dir, and routing.
4. **Deploy**, then open your `your-app.vercel.app` URL.

> Vercel's free tier is generous for a personal tool; the function cold-starts in
> well under a second since the corpus is just JSON read into memory.

## Where your data lives

- **`data/<conference>/papers.json`** — the scraped corpus (regenerable, committed).
  Loaded into memory at startup; it's read-only and never touches the database.
- **Supabase `decisions` table** — your swipe decisions (the `decision`, `read`,
  and `seq` fields per paper), which is what makes resume work. This is the only
  mutable state, and lives in Postgres so it persists on a stateless host (Vercel).
  Re-scraping never touches it.
- **Export**: the **⬇ Export CSV** button (or `GET /api/<conf>/export.csv`).

## Adding another conference (CVPR / CoRL / RSS / …)

Two pieces:

1. **Register it** in [`config/conferences.mjs`](config/conferences.mjs) — id, name,
   which `provider` handles its source, and that provider's params.
2. **Provider** in [`scraper/providers/`](scraper/providers/) — a module exporting
   `async scrape(conf, { log }) -> paper[]`. Four providers exist:
   - [`papercept.mjs`](scraper/providers/papercept.mjs) — PaperCept day-pages (ICRA, IROS, …); add a registry entry with `base`/`pages`.
   - [`cvf.mjs`](scraper/providers/cvf.mjs) — CVF Open Access (CVPR/ICCV/WACV); param `confPath` (e.g. `ICCV2025`).
   - [`openreview.mjs`](scraper/providers/openreview.mjs) — OpenReview API (CoRL, …); param `venueid`.
   - [`rss.mjs`](scraper/providers/rss.mjs) — roboticsproceedings.org (RSS); param `base` (e.g. `.../rss22/`).

   A genuinely new source needs a new provider file; shared fetch/concurrency helpers
   live in [`scraper/util.mjs`](scraper/util.mjs).

Then `npm run scrape -- <id>` and refresh — it appears in the conference dropdown.

A paper record is:
`{ id, title, authors, keywords, abstract, session, day, time, url }`
(the driver adds `conference` and `ord`).

## Project layout

```
config/conferences.mjs      registry of conferences + which provider scrapes each
scraper/scrape.mjs          generic driver: node scraper/scrape.mjs <id|all>
scraper/providers/*.mjs     per-source scrapers (papercept today)
scraper/enrich-pdfs.mjs     resolve direct PDF links (Semantic Scholar)
server/supabase.mjs         Supabase client (from env vars)
server/db.mjs               in-memory papers corpus + Supabase-backed decisions
server/app.mjs              Express API + (locally) serves the built web app
server/index.mjs            local entry: `npm start` listens on a port
api/[...slug].mjs           Vercel serverless entry (mounts the Express app)
supabase/schema.sql         the `decisions` table (run once in Supabase)
scripts/migrate-decisions.mjs  one-time push of existing swipes into Supabase
vercel.json                 Vercel build + routing config
web/                        Vite + React UI (SwipeView, LikedView)
data/<id>/papers.json       scraped corpus per conference (committed, read-only)
```

## API (all paper routes scoped to a conference id)

```
GET  /api/conferences                  loaded conferences + stats
GET  /api/:conf/next                   next undecided paper + stats
POST /api/:conf/decision               { paperId, decision: like|dislike|skip }
POST /api/:conf/undo                   revert most recent decision
POST /api/:conf/set                    { paperId, decision|null }  (re-decide / clear)
GET  /api/:conf/papers?status=&q=      browse like|dislike|skip|undecided|all + search
GET  /api/:conf/export.csv             download decisions as CSV
```
