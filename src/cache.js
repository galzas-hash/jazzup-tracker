// Tiny wrapper around localStorage so the app can open instantly with the
// last data it saw, then refresh in the background.
const PREFIX = 'jazzup:'
export function cacheGet(key) {
  try { const v = localStorage.getItem(PREFIX + key); return v ? JSON.parse(v) : null } catch { return null }
}
export function cacheSet(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)) } catch { /* storage full or blocked */ }
}
export function cacheClear() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)) } catch { /* ignore */ }
}

// Helpers to change one table inside a cached data object
export const localOps = (setData) => ({
  add: (t, rows) => setData((d) => d && { ...d, [t]: [...d[t], ...(Array.isArray(rows) ? rows : [rows])] }),
  upd: (t, row) => setData((d) => d && { ...d, [t]: d[t].map((x) => (x.id === row.id ? row : x)) }),
  del: (t, ids) => setData((d) => d && { ...d, [t]: d[t].filter((x) => !(Array.isArray(ids) ? ids : [ids]).includes(x.id)) }),
})
