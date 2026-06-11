// Thin API client. All paper routes are scoped to a conference id.
//
// Reads are public. Writes carry an `x-edit-code` header with the edit password,
// which the user unlocks once (stored in localStorage). See `auth` below.
const LS_CODE = 'paperswiper.editcode';
let editCode = localStorage.getItem(LS_CODE) || '';

export const auth = {
  get code() {
    return editCode;
  },
  has() {
    return !!editCode;
  },
  set(code) {
    editCode = code || '';
    if (editCode) localStorage.setItem(LS_CODE, editCode);
    else localStorage.removeItem(LS_CODE);
  },
};

const j = async (url, opts) => {
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {}
    const err = new Error(msg);
    err.status = res.status; // callers check 401 to re-lock the editing UI
    throw err;
  }
  return res.json();
};

const post = (url, body, { code = editCode } = {}) =>
  j(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(code ? { 'x-edit-code': code } : {}) },
    body: JSON.stringify(body),
  });

export const api = {
  config: () => j('/api/config'),
  // Validate a candidate password (without storing it); resolves on success, throws 401 otherwise.
  unlock: (code) => post('/api/unlock', { code }, { code }),
  conferences: () => j('/api/conferences'),
  next: (conf) => j(`/api/${conf}/next`),
  stats: (conf) => j(`/api/${conf}/stats`),
  decide: (conf, paperId, decision) => post(`/api/${conf}/decision`, { paperId, decision }),
  undo: (conf) => post(`/api/${conf}/undo`, {}),
  set: (conf, paperId, decision) => post(`/api/${conf}/set`, { paperId, decision }),
  setRead: (conf, paperId, read) => post(`/api/${conf}/read`, { paperId, read }),
  papers: (conf, status, q) =>
    j(`/api/${conf}/papers?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q || '')}`),
  exportUrl: (conf) => `/api/${conf}/export.csv`,
};
