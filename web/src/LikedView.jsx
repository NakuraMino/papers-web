import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { paperLinks } from './links.js';

const FILTERS = [
  { key: 'like', label: '♥ Liked' },
  { key: 'skip', label: '↑ Maybe' },
  { key: 'dislike', label: '✕ Declined' },
  { key: 'undecided', label: 'Undecided' },
  { key: 'all', label: 'All' },
];

export default function LikedView({ conf }) {
  const [status, setStatus] = useState('like');
  const [q, setQ] = useState('');
  const [papers, setPapers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { papers, stats } = await api.papers(conf, status, q);
      setPapers(papers);
      setStats(stats);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [conf, status, q]);

  // debounce search a touch
  useEffect(() => {
    const t = setTimeout(load, q ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const change = async (paperId, decision) => {
    try {
      await api.set(conf, paperId, decision);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  // optimistic read toggle (moves the paper between the Not read / Read groups)
  const markRead = async (paperId, read) => {
    setPapers((prev) => prev.map((p) => (p.id === paperId ? { ...p, read: read ? 1 : 0 } : p)));
    try {
      await api.setRead(conf, paperId, read);
    } catch (e) {
      setError(e.message);
      load();
    }
  };

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const count = (k) => (stats ? stats[k] : 0);

  const renderItem = (p) => {
    const open = expanded.has(p.id);
    return (
      <li className="paper-item" key={p.id}>
        <div className="paper-head" onClick={() => toggle(p.id)}>
          <div className="paper-head-main">
            <span className="paper-title">{p.title || '(untitled)'}</span>
            <span className="paper-authors">{p.authors}</span>
          </div>
          <div className="paper-head-side">
            {p.decision && (
              <button
                className={`read-toggle${p.read ? ' read' : ''}`}
                title={p.read ? 'Mark as not read' : 'Mark as read'}
                onClick={(e) => {
                  e.stopPropagation();
                  markRead(p.id, !p.read);
                }}
              >
                {p.read ? '✓ Read' : 'Mark read'}
              </button>
            )}
            {p.decision && <span className={`badge ${p.decision}`}>{p.decision}</span>}
            <span className="caret">{open ? '▾' : '▸'}</span>
          </div>
        </div>

        {open && (
          <div className="paper-body">
            {p.keywords && (
              <div className="card-keywords">
                {p.keywords.split(';').map((k, i) => (
                  <span className="kw" key={i}>
                    {k.trim()}
                  </span>
                ))}
              </div>
            )}
            <p className="paper-abstract">{p.abstract || '(no abstract)'}</p>
            <div className="paper-foot">
              <div className="set-buttons">
                <button className={btnCls(p, 'like')} onClick={() => change(p.id, 'like')}>
                  ♥ Like
                </button>
                <button className={btnCls(p, 'skip')} onClick={() => change(p.id, 'skip')}>
                  ↑ Maybe
                </button>
                <button className={btnCls(p, 'dislike')} onClick={() => change(p.id, 'dislike')}>
                  ✕ Decline
                </button>
                <button className="set-btn" onClick={() => change(p.id, null)}>
                  ↩ Clear
                </button>
              </div>
              <div className="paper-links">
                {paperLinks(p).map((l) => (
                  <a key={l.kind} className={`paper-link ${l.kind}`} href={l.href} target="_blank" rel="noreferrer">
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </li>
    );
  };

  const renderGroup = (title, items) => (
    <section className="paper-group" key={title}>
      <div className="group-head">
        {title} <span className="group-count">({items.length})</span>
      </div>
      {items.length ? (
        <ul className="paper-list">{items.map(renderItem)}</ul>
      ) : (
        <div className="group-empty">none yet</div>
      )}
    </section>
  );

  // group decided lists into Not read / Read; leave Undecided ungrouped
  const grouped = status !== 'undecided';
  const unread = papers.filter((p) => !p.read);
  const read = papers.filter((p) => p.read);

  return (
    <div className="liked">
      <div className="liked-toolbar">
        <div className="filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={status === f.key ? 'filter active' : 'filter'}
              onClick={() => setStatus(f.key)}
            >
              {f.label}
              {f.key === 'like' && ` (${count('liked')})`}
              {f.key === 'skip' && ` (${count('skipped')})`}
              {f.key === 'dislike' && ` (${count('disliked')})`}
              {f.key === 'undecided' && ` (${count('remaining')})`}
              {f.key === 'all' && stats && ` (${stats.total})`}
            </button>
          ))}
        </div>
        <div className="liked-actions">
          <input
            className="search"
            placeholder="Search title, author, keyword, abstract…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <a className="btn ghost small" href={api.exportUrl(conf)}>
            ⬇ Export CSV
          </a>
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}
      {loading ? (
        <div className="empty">Loading…</div>
      ) : papers.length === 0 ? (
        <div className="empty">
          <p>Nothing here yet.</p>
        </div>
      ) : grouped ? (
        <>
          {renderGroup('📖 Not read', unread)}
          {renderGroup('✓ Read', read)}
        </>
      ) : (
        <ul className="paper-list">{papers.map(renderItem)}</ul>
      )}
    </div>
  );
}

const btnCls = (p, kind) => (p.decision === kind ? `set-btn ${kind} active` : `set-btn ${kind}`);
