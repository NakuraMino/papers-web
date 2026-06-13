import { useEffect, useState } from 'react';
import { api, auth } from './api.js';
import SwipeView from './SwipeView.jsx';
import LikedView from './LikedView.jsx';

const LS_CONF = 'paperswiper.conf';
const LS_TAB = 'paperswiper.tab';

export default function App() {
  const [confs, setConfs] = useState(null); // null = loading
  const [conf, setConf] = useState(localStorage.getItem(LS_CONF) || '');
  const [tab, setTab] = useState(localStorage.getItem(LS_TAB) || 'swipe');
  const [error, setError] = useState('');

  // Editing is password-gated. editEnabled = does the server require a password
  // at all; canEdit = are we currently unlocked with a valid one.
  const [editEnabled, setEditEnabled] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);

  // Day/night theme. The initial value is applied pre-paint by an inline script
  // in index.html (no flash); here we just track and persist toggles.
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('paperswiper.theme', theme);
    // keep the OS/browser chrome (PWA status bar, Android tab color) in sync with the theme
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0b0b0c');
  }, [theme]);

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

  // Discover whether editing is gated, and re-validate any stored password
  // (handles a rotated/forgotten code by quietly re-locking).
  useEffect(() => {
    api
      .config()
      .then(async ({ editEnabled }) => {
        setEditEnabled(editEnabled);
        if (editEnabled && auth.has()) {
          try {
            await api.unlock(auth.code);
            setCanEdit(true);
          } catch {
            auth.set('');
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (conf) localStorage.setItem(LS_CONF, conf);
  }, [conf]);
  useEffect(() => localStorage.setItem(LS_TAB, tab), [tab]);

  const current = confs?.find((c) => c.id === conf);

  // Called by the views if a write unexpectedly 401s (e.g. code rotated server-side).
  const onLocked = () => {
    auth.set('');
    setCanEdit(false);
    setShowUnlock(true);
  };

  const lock = () => {
    auth.set('');
    setCanEdit(false);
  };

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

        <div className="lock-area">
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            title={theme === 'light' ? 'Switch to night mode' : 'Switch to day mode'}
            aria-label="Toggle day / night theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {!editEnabled ? (
            <span className="lock-chip view-only" title="This site is read-only">
              👁 View-only
            </span>
          ) : canEdit ? (
            <button className="lock-chip unlocked" onClick={lock} title="Click to lock editing on this device">
              🔓 Editing
            </button>
          ) : (
            <button className="lock-chip locked" onClick={() => setShowUnlock(true)} title="Enter the edit password">
              🔒 Unlock to edit
            </button>
          )}
        </div>
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
        {conf && tab === 'swipe' && <SwipeView conf={conf} canEdit={canEdit} onLocked={onLocked} />}
        {conf && tab === 'liked' && <LikedView conf={conf} canEdit={canEdit} onLocked={onLocked} />}
      </main>

      {showUnlock && (
        <UnlockModal
          onClose={() => setShowUnlock(false)}
          onUnlocked={() => {
            setCanEdit(true);
            setShowUnlock(false);
          }}
        />
      )}
    </div>
  );
}

function UnlockModal({ onClose, onUnlocked }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api.unlock(code);
      auth.set(code);
      onUnlocked();
    } catch (e2) {
      setErr(e2.message || 'Incorrect password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Unlock editing</h3>
        <p className="modal-sub">Enter the edit password to record, change, or undo decisions on this device.</p>
        <input
          className="modal-input"
          type="password"
          autoFocus
          placeholder="Edit password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {err && <div className="modal-err">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost small" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn small" disabled={busy || !code}>
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </div>
  );
}
