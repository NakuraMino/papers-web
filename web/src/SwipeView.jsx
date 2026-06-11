import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { api } from './api.js';
import { paperLinks } from './links.js';
import FiltersModal from './FiltersModal.jsx';

const SWIPE_PX = 120; // drag distance that commits a decision

export default function SwipeView({ conf, canEdit, onLocked }) {
  const [paper, setPaper] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const exitDir = useRef('right'); // direction the leaving card flies

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { paper, stats } = await api.next(conf);
      setPaper(paper);
      setStats(stats);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [conf]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = useCallback(
    async (decision) => {
      if (!paper || busy || !canEdit) return;
      exitDir.current = decision === 'like' ? 'right' : decision === 'dislike' ? 'left' : 'up';
      setBusy(true);
      try {
        const { paper: next, stats } = await api.decide(conf, paper.id, decision);
        setPaper(next);
        setStats(stats);
      } catch (e) {
        setError(e.message);
        if (e.status === 401) onLocked?.();
      } finally {
        setBusy(false);
      }
    },
    [paper, busy, conf, canEdit, onLocked],
  );

  const undo = useCallback(async () => {
    if (busy || !canEdit) return;
    setBusy(true);
    try {
      const { paper, stats } = await api.undo(conf);
      setPaper(paper);
      setStats(stats);
    } catch (e) {
      setError(e.message);
      if (e.status === 401) onLocked?.();
    } finally {
      setBusy(false);
    }
  }, [busy, conf, canEdit, onLocked]);

  // keyboard shortcuts (only when unlocked for editing)
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') decide('like');
      else if (e.key === 'ArrowLeft') decide('dislike');
      else if (e.key === 'ArrowUp') decide('skip');
      else if (e.key === 'z' || e.key === 'u' || e.key === 'Backspace') undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, undo, canEdit]);

  // Progress is measured against the swipeable set (excludes keyword-hidden
  // papers), so it reaches 100% exactly when the queue is empty.
  const effective = stats ? stats.decided + stats.remaining : 0;
  const pct = effective ? Math.round((stats.decided / effective) * 100) : 0;

  return (
    <div className="swipe">
      {stats && (
        <div className="progress-wrap">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-row">
            <div className="progress-text">
              {stats.decided}/{effective} decided · {stats.remaining} left
              {stats.filtered ? ` · ${stats.filtered} hidden` : ''} ·{' '}
              <span className="like-count">♥ {stats.liked}</span>
            </div>
            <button className="filters-btn" onClick={() => setShowFilters(true)} title="Hide papers by keyword">
              🚫 Filters{stats.filtered ? ` (${stats.filtered})` : ''}
            </button>
          </div>
        </div>
      )}

      {error && <div className="banner error">{error}</div>}

      <div className="card-stage">
        <AnimatePresence mode="popLayout" custom={exitDir}>
          {loading ? (
            <div className="card-placeholder">Loading…</div>
          ) : paper ? (
            <Card key={paper.id} paper={paper} onDecide={decide} disabled={busy || !canEdit} exitDir={exitDir} />
          ) : (
            <div className="empty done" key="done">
              <h2>🎉 All done</h2>
              <p>You’ve triaged every paper in this conference.</p>
              {canEdit && (
                <button className="btn ghost" onClick={undo}>
                  ↩ Undo last
                </button>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>

      {paper && canEdit && (
        <div className="controls">
          <button className="btn nope" onClick={() => decide('dislike')} disabled={busy} title="Decline (←)">
            ✕
          </button>
          <button className="btn skip" onClick={() => decide('skip')} disabled={busy} title="Maybe / skip (↑)">
            ↑
          </button>
          <button className="btn undo" onClick={undo} disabled={busy} title="Undo (z)">
            ↩
          </button>
          <button className="btn like" onClick={() => decide('like')} disabled={busy} title="Accept (→)">
            ♥
          </button>
        </div>
      )}

      {paper &&
        (canEdit ? (
          <div className="hint">← decline · → accept · ↑ maybe · z undo · or drag the card</div>
        ) : (
          <div className="hint locked">🔒 View-only — unlock editing (top right) to swipe</div>
        ))}

      {showFilters && (
        <FiltersModal
          conf={conf}
          canEdit={canEdit}
          onLocked={onLocked}
          onClose={() => setShowFilters(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function Card({ paper, onDecide, disabled, exitDir }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-18, 18]);
  const likeOpacity = useTransform(x, [40, 160], [0, 1]);
  const nopeOpacity = useTransform(x, [-160, -40], [1, 0]);
  const skipOpacity = useTransform(y, [-160, -40], [1, 0]);

  const onDragEnd = (_e, info) => {
    if (info.offset.x > SWIPE_PX) onDecide('like');
    else if (info.offset.x < -SWIPE_PX) onDecide('dislike');
    else if (info.offset.y < -SWIPE_PX) onDecide('skip');
  };

  const exitVariant = () => {
    const d = exitDir.current;
    if (d === 'left') return { x: -600, opacity: 0, transition: { duration: 0.25 } };
    if (d === 'up') return { y: -600, opacity: 0, transition: { duration: 0.25 } };
    return { x: 600, opacity: 0, transition: { duration: 0.25 } };
  };

  return (
    <motion.div
      className="card"
      style={{ x, y, rotate }}
      drag={!disabled}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={exitVariant()}
      whileTap={{ cursor: 'grabbing' }}
    >
      <motion.div className="stamp like-stamp" style={{ opacity: likeOpacity }}>
        ACCEPT
      </motion.div>
      <motion.div className="stamp nope-stamp" style={{ opacity: nopeOpacity }}>
        DECLINE
      </motion.div>
      <motion.div className="stamp skip-stamp" style={{ opacity: skipOpacity }}>
        MAYBE
      </motion.div>

      {/* left column: metadata */}
      <div className="card-info">
        <div className="card-meta">
          {paper.session && <span className="chip">{paper.session}</span>}
          {paper.day && <span className="chip subtle">{paper.day}</span>}
          {paper.time && <span className="chip subtle">{paper.time}</span>}
        </div>

        <h2 className="card-title">{paper.title || '(untitled)'}</h2>
        {paper.authors && <div className="card-authors">{paper.authors}</div>}

        {paper.keywords && (
          <div className="card-keywords">
            {paper.keywords.split(';').map((k, i) => (
              <span className="kw" key={i}>
                {k.trim()}
              </span>
            ))}
          </div>
        )}

        <div className="card-links" onPointerDownCapture={(e) => e.stopPropagation()}>
          {paperLinks(paper).map((l) => (
            <a key={l.kind} className={`card-link ${l.kind}`} href={l.href} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          ))}
        </div>
      </div>

      {/* right column: dedicated abstract */}
      <div className="card-abstract-col">
        <div className="abstract-label">Abstract</div>
        <div
          className={`card-abstract${paper.abstract ? '' : ' is-empty'}`}
          onPointerDownCapture={(e) => e.stopPropagation()}
        >
          {paper.abstract || '(no abstract available)'}
        </div>
      </div>
    </motion.div>
  );
}
