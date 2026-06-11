// Provider: RSS (Robotics: Science and Systems) on roboticsproceedings.org.
// The volume index lists per-paper pages (pNNN.html); each paper page holds the
// title (h3), authors (italic), the abstract paragraph, and a pNNN.pdf link.
import { load } from 'cheerio';
import { fetchHtml, mapPool, clean } from '../util.mjs';

export async function scrape(conf, { log = () => {} } = {}) {
  const { base } = conf.params; // e.g. https://www.roboticsproceedings.org/rss21/
  const index = await fetchHtml(`${base}index.html`);
  if (!index) throw new Error(`index not found at ${base}index.html`);

  const stems = [...new Set([...index.matchAll(/href="(p\d{3})\.html"/g)].map((m) => m[1]))];
  log(`  ${stems.length} papers in index`);

  const recs = await mapPool(
    stems,
    8,
    async (stem) => {
      const html = await fetchHtml(`${base}${stem}.html`);
      if (!html) return null;
      const $ = load(html);
      const content = $('.content');

      const title = clean(content.find('h3').first().text());
      const authors = clean(content.find('i').first().text());

      // abstract is the justified paragraph; fall back to the <p> after "Abstract:"
      let abstract = clean(content.find('p[style*="justify"]').first().text());
      if (!abstract) {
        const lbl = content.find('b').filter((_, e) => /Abstract/i.test($(e).text())).first();
        abstract = clean(lbl.closest('p').nextAll('p').first().text());
      }

      return {
        id: stem,
        title,
        authors,
        keywords: '',
        abstract,
        session: '',
        day: '',
        time: '',
        url: `${base}${stem}.html`,
        pdfUrl: `${base}${stem}.pdf`,
        arxivUrl: '',
        doi: '',
      };
    },
    (d, t) => { if (d % 40 === 0 || d === t) log(`  fetched ${d}/${t}`); },
  );

  return recs.filter(Boolean);
}
