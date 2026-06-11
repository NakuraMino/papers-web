// Provider: PaperCept "ContentListWeb" day-pages.
// Used by ICRA / IROS / and other RAS conferences hosted on papercept.net.
//
// Each page is one conference day of large static HTML; every paper carries its
// full abstract inline (hidden behind a JS toggle in the browser, present in the
// source). Pages are typically windows-1252 encoded.
//
// A provider exports: async scrape(conf, { log }) -> paper[] (without `conference`).
import { load } from 'cheerio';
import { decodeBuffer, stripControls } from '../cp1252.mjs';

const clean = (s) => stripControls(s || '').replace(/\s+/g, ' ').trim();

async function fetchPage(url, encoding) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (paper-swiper scraper)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return decodeBuffer(buf, encoding); // proper cp1252 (Node's TextDecoder mis-decodes 0x80-0x9F)
}

function parseDay(html) {
  const m = html.match(/Technical Program for ([^<]+?)\s*</);
  return m ? clean(m[1]) : '';
}

function parsePapers(html, pageUrl) {
  const $ = load(html);
  const day = parseDay(html);
  const papers = [];

  $('tr.pHdr').each((_, el) => {
    const $h = $(el);
    const nameA = $h.find('a[name]').first();
    const headerText = clean(nameA.text()); // "09:00-10:30, Paper TuI1I.1"
    const anchor = nameA.attr('name') || '';

    const code = headerText.match(/Paper\s+(\S+?)\s*$/)?.[1] || '';
    if (!code) return;

    const timeM = headerText.match(/([\d:]+)\s*-\s*([\d:]+)/);
    const time = timeM ? `${timeM[1]}-${timeM[2]}` : '';
    const session = code.includes('.') ? code.slice(0, code.lastIndexOf('.')) : code;

    const rows = $h.nextUntil('tr.pHdr');

    const titleA = rows.find('span.pTtl a').first();
    const title = clean(titleA.text());
    const absId = (titleA.attr('onclick') || '').match(/viewAbstract\('(\d+)'\)/)?.[1] || null;

    const authors = [];
    rows.filter('tr').each((__, r) => {
      const $r = $(r);
      const a = $r.find('td a[href*="AuthorIndex"]').first();
      if (!a.length) return;
      const name = clean(a.text());
      const affil = clean($r.find('td.r').first().text());
      if (name) authors.push(affil ? `${name} (${affil})` : name);
    });

    let keywords = [];
    let abstract = '';
    if (absId) {
      const ab = $(`#Ab${absId}`);
      if (ab.length) {
        ab.find('a[href*="KeywordIndex"]').each((__, k) => keywords.push(clean($(k).text())));
        const full = clean(ab.text());
        const ai = full.indexOf('Abstract:');
        abstract = ai >= 0 ? full.slice(ai + 'Abstract:'.length).trim() : full;
      }
    }

    papers.push({
      id: code,
      title,
      authors: authors.join('; '),
      keywords: keywords.join('; '),
      abstract,
      session,
      day,
      time,
      url: `${pageUrl}#${anchor}`,
      pdfUrl: '', // populated later by scraper/enrich-pdfs.mjs
      arxivUrl: '',
      doi: '',
    });
  });

  return papers;
}

export async function scrape(conf, { log = () => {} } = {}) {
  const { base, pages, encoding } = conf.params;
  const byId = new Map();

  for (const file of pages) {
    const url = base + file;
    log(`  fetching ${file} ... `, false);
    let parsed = [];
    try {
      const html = await fetchPage(url, encoding);
      parsed = parsePapers(html, url);
    } catch (err) {
      log(`FAILED (${err.message})`);
      continue;
    }
    let added = 0;
    for (const p of parsed) {
      if (!byId.has(p.id)) {
        byId.set(p.id, p);
        added++;
      }
    }
    log(`${parsed.length} papers (${added} new)`);
  }

  return [...byId.values()];
}
