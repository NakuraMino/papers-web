// Registry of conferences this app knows how to scrape + browse.
//
// Each entry is conference metadata + which `provider` (scraper backend) handles
// its source and the params that provider needs. To add a conference you add an
// entry here and, if its source is new, a provider module in scraper/providers/.
//
// Providers implemented today:
//   - "papercept": PaperCept "ContentListWeb" day-pages (ICRA, IROS, CoRL-on-RAS, ...)
// Providers to add later (CVPR / RSS / CoRL-OpenReview):
//   - "cvf":        CVF Open Access (thecvf.com) — CVPR/ICCV/WACV
//   - "rss":        roboticsproceedings.org — RSS
//   - "openreview": OpenReview API — CoRL (recent years)

export const CONFERENCES = {
  icra2026: {
    id: 'icra2026',
    name: 'ICRA 2026',
    venue: 'Vienna, Austria',
    provider: 'papercept',
    params: {
      base: 'https://ras.papercept.net/conferences/conferences/ICRA26/program/',
      // one large static page per conference day (Sun..Fri)
      pages: [1, 2, 3, 4, 5, 6].map((n) => `ICRA26_ContentListWeb_${n}.html`),
      encoding: 'windows-1252',
    },
  },

  rss2025: {
    id: 'rss2025',
    name: 'RSS 2025',
    venue: 'Los Angeles, USA',
    provider: 'rss',
    params: { base: 'https://www.roboticsproceedings.org/rss21/' },
  },

  corl2025: {
    id: 'corl2025',
    name: 'CoRL 2025',
    venue: 'Seoul, Korea',
    provider: 'openreview',
    params: { venueid: 'robot-learning.org/CoRL/2025/Conference' },
  },

  cvpr2026: {
    id: 'cvpr2026',
    name: 'CVPR 2026',
    venue: 'Denver, USA',
    provider: 'cvf',
    params: { confPath: 'CVPR2026' },
  },

  // --- not yet published as of 2026-06-07 (conference hasn't happened / no
  //     abstracts online). Add when their proceedings go live: ---
  // rss2026:  provider 'rss',        params { base: 'https://www.roboticsproceedings.org/rss22/' }   // 404 today
  // corl2026: provider 'openreview', params { venueid: 'robot-learning.org/CoRL/2026/Conference' }   // empty today
};

export const listConferences = () => Object.values(CONFERENCES);
export const getConference = (id) => CONFERENCES[id] || null;
