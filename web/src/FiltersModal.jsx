import { useEffect, useState } from 'react';
import { api } from './api.js';

// Manage the per-conference keyword filters. The whole set is saved on every
// change (add / edit / remove all route through `save`), and `onChanged` lets the
// caller refresh the queue so hiding takes effect immediately.
export default function FiltersModal({ conf, canEdit, onClose, onChanged, onLocked }) {
  const [filters, setFilters] = useState(null); // null = loading
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .filters(conf)
      .then(({ filters }) => alive && setFilters(filters))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [conf]);

  const save = async (next) => {
    setBusy(true);
    setErr('');
    try {
      const { filters: saved } = await api.setFilters(conf, next);
      setFilters(saved);
      onChanged?.();
    } catch (e) {
      setErr(e.message);
      if (e.status === 401) onLocked?.();
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const t = draft.trim();
    if (!t || !filters) return;
    if (filters.some((f) => f.toLowerCase() === t.toLowerCase())) {
      setDraft('');
      return;
    }
    save([...filters, t]);
    setDraft('');
  };
  const removeAt = (i) => save(filters.filter((_, j) => j !== i));
  const editAt = (i, val) => {
    const v = val.trim();
    if (v === filters[i]) return;
    if (!v) return removeAt(i);
    save(filters.map((t, j) => (j === i ? v : t)));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal filters-modal" onClick={(e) => e.stopPropagation()}>
        <h3>🚫 Hide papers matching…</h3>
        <p className="modal-sub">
          Any paper whose title, keywords, or abstract contains one of these terms is hidden from the swipe queue for{' '}
          <strong>{conf}</strong>. Already-decided papers aren’t affected.
        </p>
        {err && <div className="modal-err">{err}</div>}

        {filters === null ? (
          <div className="modal-sub">Loading…</div>
        ) : filters.length === 0 ? (
          <div className="modal-sub">No filters yet{canEdit ? ' — add one below.' : '.'}</div>
        ) : (
          <ul className="filter-list">
            {filters.map((term, i) => (
              <FilterRow
                key={`${i}:${term}`}
                term={term}
                canEdit={canEdit}
                busy={busy}
                onSave={(v) => editAt(i, v)}
                onRemove={() => removeAt(i)}
              />
            ))}
          </ul>
        )}

        {canEdit ? (
          <form className="filter-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input
              className="modal-input"
              placeholder="e.g. agriculture"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
            />
            <button type="submit" className="btn small" disabled={busy || !draft.trim()}>
              Add
            </button>
          </form>
        ) : (
          <div className="modal-sub">🔒 Unlock editing (top right) to change filters.</div>
        )}

        <div className="modal-actions">
          <button className="btn ghost small" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterRow({ term, canEdit, busy, onSave, onRemove }) {
  const [val, setVal] = useState(term);
  useEffect(() => setVal(term), [term]);
  return (
    <li className="filter-row">
      <input
        className="filter-input"
        value={val}
        disabled={!canEdit || busy}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onBlur={() => canEdit && onSave(val)}
      />
      {canEdit && (
        <button className="filter-remove" title="Remove filter" disabled={busy} onClick={onRemove}>
          ✕
        </button>
      )}
    </li>
  );
}
