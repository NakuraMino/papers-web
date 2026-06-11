// Provider: OpenReview API v2 (api2.openreview.net) — used by CoRL.
// Querying by the conference venueid returns only accepted papers, each with
// title/abstract/authors/keywords/pdf. API2 nests every content field under .value.
import { fetchJson, clean } from '../util.mjs';

export async function scrape(conf, { log = () => {} } = {}) {
  const { venueid } = conf.params; // e.g. robot-learning.org/CoRL/2025/Conference
  const all = [];
  let offset = 0;

  for (;;) {
    const url = `https://api2.openreview.net/notes?content.venueid=${encodeURIComponent(venueid)}&limit=1000&offset=${offset}`;
    const data = await fetchJson(url);
    const notes = data.notes || [];
    all.push(...notes);
    log(`  fetched ${all.length}${data.count ? '/' + data.count : ''}`);
    if (notes.length < 1000) break;
    offset += 1000;
  }

  return all.map((n) => {
    const val = (k) => {
      const f = n.content?.[k];
      return f ? (f.value ?? f) : undefined;
    };
    const authors = val('authors');
    const keywords = val('keywords');
    const pdf = val('pdf');
    return {
      id: String(n.id),
      title: clean(val('title')),
      authors: (Array.isArray(authors) ? authors : []).join('; '),
      keywords: (Array.isArray(keywords) ? keywords : []).join('; '),
      abstract: clean(val('abstract')),
      session: clean(val('venue')), // e.g. "CoRL 2025 Oral" / "CoRL 2025 Poster"
      day: '',
      time: '',
      url: `https://openreview.net/forum?id=${n.id}`,
      pdfUrl: pdf ? `https://openreview.net${pdf}` : '',
      arxivUrl: '',
      doi: '',
    };
  });
}
