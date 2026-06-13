import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { api } from './api.js';
import { paperLinks } from './links.js';
import FiltersModal from './FiltersModal.jsx';

const SWIPE_PX = 120; // drag distance that commits a decision
const BATCH = 8; // papers pulled per server round-trip
const REFILL_AT = 3; // top up the buffer once it drops to this many cards

export default function SwipeView({ conf, canEdit, onLocked }) {
  // Swipes feel instant because we keep a small buffer of upcoming papers on the
  // client (`queue`, indexed by `pos`) and write each decision in the background
  // instead of blocking the next card on a round-trip. The buffer refills before
  // it runs dry. Decisions are serialized through `writeChain` so undo/refill see
  // a consistent order, and stats update optimistically for instant progress.
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const exitDir = useRef('right'); // direction the leaving card flies
  const queueRef = useRef([]); // mirror of queue, for synchronous reads in decide()
  const posRef = useRef(0); // mirror of pos, so rapid swipes never reuse a card
  const seenIds = useRef(new Set()); // every id ever buffered — dedupes refills
  const writeChain = useRef(Promise.resolve()); // serializes background decision writes
  const refilling = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    writeChain.current = Promise.resolve();
    refilling.current = false;
    try {
      const { papers, stats: s } = await api.queue(conf, BATCH);
      seenIds.current = new Set(papers.map((p) => p.id));
      queueRef.current = papers;
      posRef.current = 0;
      setQueue(papers);
      setPos(0);
      setStats(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [conf]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Refill the buffer when it gets low. We wait for pending writes to land first,
  // so the server's "next N" already excludes everything we've decided.
  const refill = useCallback(async () => {
    if (refilling.current) return;
    refilling.current = true;
    try {
      await writeChain.current;
      const { papers } = await api.queue(conf, BATCH);
      const add = papers.filter((p) => !seenIds.current.has(p.id));
      if (add.length) {
        add.forEach((p) => seenIds.current.add(p.id));
        queueRef.current = queueRef.current.concat(add);
        setQueue(queueRef.current);
      }
    } catch {
      // non-fatal — the next swipe will trigger another refill
    } finally {
      refilling.current = false;
    }
  }, [conf]);

  useEffect(() => {
    if (!loading && queue.length - pos <= REFILL_AT) refill();
  }, [queue.length, pos, loading, refill]);

  const decide = useCallback(
    (decision) => {
      if (!canEdit) return;
      const idx = posRef.current;
      const current = queueRef.current[idx];
      if (!current) return;
      exitDir.current = decision === 'like' ? 'right' : decision === 'dislike' ? 'left' : 'up';

      // 1) advance the UI immediately from the local buffer...
      posRef.current = idx + 1;
      setPos(idx + 1);
      setStats(
        (s) =>
          s && {
            ...s,
            decided: s.decided + 1,
            remaining: Math.max(0, s.remaining - 1),
            liked: s.liked + (decision === 'like' ? 1 : 0),
            disliked: s.disliked + (decision === 'dislike' ? 1 : 0),
            skipped: s.skipped + (decision === 'skip' ? 1 : 0),
          },
      );

      // 2) ...and persist the decision in the background, in swipe order.
      writeChain.current = writeChain.current
        .then(() => api.decide(conf, current.id, decision))
        .catch((e) => {
          setError(e.status === 401 ? 'Editing locked — unlock to keep swiping.' : e.message || 'Could not save your swipe.');
          if (e.status === 401) onLocked?.();
          reload(); // a failed write means our optimistic advance was wrong — resync
        });
    },
    [canEdit, conf, onLocked, reload],
  );

  const undo = useCallback(async () => {
    if (!canEdit) return;
    setError('');
    try {
      await writeChain.current; // make sure the latest decision is recorded before reverting it
      await api.undo(conf);
      await reload(); // rebuild the buffer from the (now reverted) front
    } catch (e) {
      setError(e.message);
      if (e.status === 401) onLocked?.();
    }
  }, [canEdit, conf, onLocked, reload]);

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
  const current = queue[pos] || null;

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
          ) : current ? (
            <Card key={current.id} paper={current} onDecide={decide} disabled={!canEdit} exitDir={exitDir} />
          ) : stats && stats.remaining > 0 ? (
            // buffer momentarily empty while a refill catches up
            <div className="card-placeholder" key="catchup">
              Loading…
            </div>
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

      {current && canEdit && (
        <div className="controls">
          <button className="btn nope" onClick={() => decide('dislike')} title="Decline (←)">
            ✕
          </button>
          <button className="btn skip" onClick={() => decide('skip')} title="Maybe / skip (↑)">
            ↑
          </button>
          <button className="btn undo" onClick={undo} title="Undo (z)">
            ↩
          </button>
          <button className="btn like" onClick={() => decide('like')} title="Accept (→)">
            ♥
          </button>
        </div>
      )}

      {current &&
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
          onChanged={reload}
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
