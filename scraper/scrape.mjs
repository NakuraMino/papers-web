// Generic scrape driver. Dispatches a conference to its provider and writes
// data/<conferenceId>/papers.json.
//
//   node scraper/scrape.mjs icra2026      # scrape one conference
//   node scraper/scrape.mjs all           # scrape every registered conference
//   node scraper/scrape.mjs               # same as `all`
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFERENCES, listConferences, getConference } from '../config/conferences.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = `${HERE}/../data`;

// provider name -> module loader
const PROVIDERS = {
  papercept: () => import('./providers/papercept.mjs'),
  rss: () => import('./providers/rss.mjs'),
  openreview: () => import('./providers/openreview.mjs'),
  cvf: () => import('./providers/cvf.mjs'),
};

const log = (msg, newline = true) =>
  newline ? console.log(msg) : process.stdout.write(msg);

async function scrapeOne(conf) {
  const loader = PROVIDERS[conf.provider];
  if (!loader) throw new Error(`no provider "${conf.provider}" for ${conf.id}`);
  const provider = await loader();

  console.log(`\n=== ${conf.name} (${conf.id}) via ${conf.provider} ===`);
  const papers = (await provider.scrape(conf, { log })).map((p, i) => ({
    ...p,
    conference: conf.id,
    ord: i,
  }));

  const withAbstract = papers.filter((p) => p.abstract && p.abstract.length > 20).length;
  const outDir = `${DATA_DIR}/${conf.id}`;
  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/papers.json`, JSON.stringify(papers, null, 2), 'utf8');

  console.log(`  TOTAL unique papers: ${papers.length}`);
  console.log(`  with non-empty abstract: ${withAbstract} (${Math.round((withAbstract / Math.max(1, papers.length)) * 100)}%)`);
  console.log(`  wrote: ${outDir}/papers.json`);

  if (papers.length < 100) {
    console.warn(`  [WARN] very few papers for ${conf.id} — provider/selectors may be off.`);
  }
  return papers.length;
}

async function main() {
  const arg = process.argv[2];
  let targets;
  if (!arg || arg === 'all') {
    targets = listConferences();
  } else {
    const conf = getConference(arg);
    if (!conf) {
      console.error(`Unknown conference "${arg}". Known: ${Object.keys(CONFERENCES).join(', ') || '(none)'}`);
      process.exit(1);
    }
    targets = [conf];
  }

  if (targets.length === 0) {
    console.error('No conferences registered in config/conferences.mjs');
    process.exit(1);
  }

  let total = 0;
  for (const conf of targets) total += await scrapeOne(conf);
  console.log(`\nDone. ${total} papers across ${targets.length} conference(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
