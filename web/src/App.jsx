import { useEffect, useState } from 'react';
import { api } from './api.js';
import SwipeView from './SwipeView.jsx';
import LikedView from './LikedView.jsx';

const LS_CONF = 'paperswiper.conf';
const LS_TAB = 'paperswiper.tab';

export default function App() {
  const [confs, setConfs] = useState(null); // null = loading
  const [conf, setConf] = useState(localStorage.getItem(LS_CONF) || '');
  const [tab, setTab] = useState(localStorage.getItem(LS_TAB) || 'swipe');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .conferences()
      .then(({ conferences }) => {
        setConfs(conferences);
        setConf((prev) => {
          if (prev && conferences.some((c) => c.id === prev)) return prev;
          return conferences[0]?.id || '';
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (conf) localStorage.setItem(LS_CONF, conf);
  }, [conf]);
  useEffect(() => localStorage.setItem(LS_TAB, tab), [tab]);

  const current = confs?.find((c) => c.id === conf);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">📑 Paper Swiper</div>

        <select className="conf-select" value={conf} onChange={(e) => setConf(e.target.value)} disabled={!confs?.length}>
          {!confs?.length && <option>— no conferences loaded —</option>}
          {confs?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.stats.total} papers
            </option>
          ))}
        </select>

        <nav className="tabs">
          <button className={tab === 'swipe' ? 'tab active' : 'tab'} onClick={() => setTab('swipe')}>
            Swipe
          </button>
          <button className={tab === 'liked' ? 'tab active' : 'tab'} onClick={() => setTab('liked')}>
            Liked{current ? ` (${current.stats.liked})` : ''}
          </button>
        </nav>
      </header>

      <main className="content">
        {error && <div className="banner error">Couldn’t reach the API: {error}</div>}
        {confs && !confs.length && !error && (
          <div className="empty">
            <h2>No conferences loaded yet</h2>
            <p>
              Run the scraper, then refresh:
              <br />
              <code>npm run scrape -- icra2026</code>
            </p>
          </div>
        )}
        {conf && tab === 'swipe' && <SwipeView conf={conf} />}
        {conf && tab === 'liked' && <LikedView conf={conf} />}
      </main>
    </div>
  );
}
