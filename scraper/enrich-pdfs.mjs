// Enrich a scraped conference with direct PDF links.
//
// The program source (PaperCept) has no PDF/DOI links, so we resolve them via
// Semantic Scholar's title-match endpoint, which returns arXiv ids + DOIs for a
// best-matching paper. From an arXiv id we build a guaranteed-free PDF link
// (https://arxiv.org/pdf/<id>); DOI is the IEEE fallback.
//
//   node scraper/enrich-pdfs.mjs icra2026
//
// Safe to stop and re-run: each paper is marked `pdfChecked` once queried, so a
// resumed run only processes the remainder. Writes ONLY data/<id>/papers.json
// (never opens the live DB — the server force-syncs from this file on startup, so
// links appear after a server restart). Politely rate-limited.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const conf = process.argv[2];
if (!conf) {
  console.error('usage: node scraper/enrich-pdfs.mjs <conferenceId>');
  process.exit(1);
}
const FILE = `${HERE}/../data/${conf}/papers.json`;
if (!existsSync(FILE)) {
  console.error(`not found: ${FILE} — run "npm run scrape -- ${conf}" first`);
  process.exit(1);
}

const S2 = 'https://api.semanticscholar.org/graph/v1/paper/search/match';
const DELAY_MS = 3500; // ~1 request / 3.5s — polite for the unauthenticated pool
const SAVE_EVERY = 20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Token Jaccard similarity — guards against false-positive matches.
function similar(a, b) {
  const A = new Set(norm(a).split(' ').filter(Boolean));
  const B = new Set(norm(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

async function lookup(title) {
  const url = `${S2}?fields=title,externalIds,openAccessPdf&query=${encodeURIComponent(title)}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': 'paper-swiper/1.0 (+enrichment)' } });
    } catch {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    if (res.status === 404) return null; // S2: no title match
    if (res.status === 429 || res.status >= 500) {
      await sleep(6000 * (attempt + 1)); // back off
      continue;
    }
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.data?.[0] || null;
  }
  return null;
}

function buildLinks(m) {
  const ext = m.externalIds || {};
  const arxivId = ext.ArXiv || null;
  // Keep real publisher DOIs; drop arXiv's own 10.48550 DOI (redundant with arXiv).
  const doi = ext.DOI && !/^10\.48550\/arxiv/i.test(ext.DOI) ? ext.DOI : '';
  const arxivUrl = arxivId ? `https://arxiv.org/abs/${arxivId}` : '';
  const arxivPdf = arxivId ? `https://arxiv.org/pdf/${arxivId}` : '';
  const oa = m.openAccessPdf?.url || '';
  const doiUrl = doi ? `https://doi.org/${doi}` : '';
  const pdfUrl = oa || arxivPdf || doiUrl || '';
  return { arxivUrl, pdfUrl, doi };
}

const papers = JSON.parse(readFileSync(FILE, 'utf8'));
const remaining = papers.filter((p) => !p.pdfChecked);
console.log(`Enriching ${conf}: ${remaining.length} to check, ${papers.length - remaining.length} already done.`);

let checked = 0;
let matched = 0;
let withPdf = 0;

for (const p of papers) {
  if (p.pdfChecked) continue;
  const m = await lookup(p.title);
  p.pdfChecked = true;
  checked++;

  if (m && (norm(m.title) === norm(p.title) || similar(m.title, p.title) >= 0.85)) {
    Object.assign(p, buildLinks(m));
    matched++;
    if (p.pdfUrl) withPdf++;
  }

  if (checked % SAVE_EVERY === 0) {
    writeFileSync(FILE, JSON.stringify(papers, null, 2));
    console.log(`  ${checked}/${remaining.length} checked · ${matched} matched · ${withPdf} with PDF`);
  }
  await sleep(DELAY_MS);
}

writeFileSync(FILE, JSON.stringify(papers, null, 2));
console.log(`Done: ${checked} checked · ${matched} matched · ${withPdf} PDF links. (${conf})`);
process.exit(0);
