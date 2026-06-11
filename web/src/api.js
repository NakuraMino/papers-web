// Thin API client. All paper routes are scoped to a conference id.
const j = async (url, opts) => {
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
};

const post = (url, body) =>
  j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
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
