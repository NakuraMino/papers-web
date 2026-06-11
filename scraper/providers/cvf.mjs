// Provider: CVF Open Access (openaccess.thecvf.com) — used by CVPR/ICCV/WACV.
// The conference page links to per-day listings; each day lists papers
// (dt.ptitle > a -> /content/<CONF>/html/..._paper.html). Abstracts live on each
// per-paper page (#abstract), with title (#papertitle), authors (#authors), pdf.
import { load } from 'cheerio';
import { fetchHtml, mapPool, clean } from '../util.mjs';

const ORIGIN = 'https://openaccess.thecvf.com';

export async function scrape(conf, { log = () => {} } = {}) {
  const { confPath } = conf.params; // e.g. CVPR2026
  const main = await fetchHtml(`${ORIGIN}/${confPath}`);
  if (!main) throw new Error(`${confPath} not found on CVF`);

  // The listing is either split across ?day=... pages or all on the main page.
  const days = [...new Set([...main.matchAll(new RegExp(`${confPath}\\?day=([0-9-]+)`, 'g'))].map((m) => m[1]))];
  const dayUrls = days.length ? days.map((d) => `${ORIGIN}/${confPath}?day=${d}`) : [`${ORIGIN}/${confPath}`];
  log(`  ${dayUrls.length} listing page(s)`);

  // Collect unique paper detail-page links (+ their listed title as a fallback).
  const linkTitle = new Map();
  for (const du of dayUrls) {
    const html = du === `${ORIGIN}/${confPath}` ? main : await fetchHtml(du);
    const $ = load(html);
    $('dt.ptitle a').each((_, a) => {
      const href = $(a).attr('href');
      if (href && /_paper\.html$/.test(href) && !linkTitle.has(href)) {
        linkTitle.set(href, clean($(a).text()));
      }
    });
  }
  const links = [...linkTitle.keys()];
  log(`  ${links.length} unique papers`);

  const recs = await mapPool(
    links,
    12,
    async (href) => {
      const html = await fetchHtml(ORIGIN + href);
      if (!html) return null;
      const $ = load(html);
      const title = clean($('#papertitle').text()) || linkTitle.get(href);
      const authors = clean($('#authors i').first().text());
      const abstract = clean($('#abstract').text());
      const pdfHref =
        $('a').filter((_, e) => /\.pdf$/i.test($(e).attr('href') || '')).first().attr('href') || '';
      const stem = href.split('/').pop().replace(/_paper\.html$/, '');
      return {
        id: stem,
        title,
        authors,
        keywords: '',
        abstract,
        session: '',
        day: '',
        time: '',
        url: ORIGIN + href,
        pdfUrl: pdfHref ? ORIGIN + pdfHref : '',
        arxivUrl: '',
        doi: '',
      };
    },
    (d, t) => { if (d % 250 === 0 || d === t) log(`  fetched ${d}/${t}`); },
  );

  return recs.filter(Boolean);
}
