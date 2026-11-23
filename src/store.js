// Petite aide pour localStorage (qui peut être indisponible : mode privé, etc.).
export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem('ld.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem('ld.' + key, JSON.stringify(value)); } catch { /* ignore */ } },
  del(key) { try { localStorage.removeItem('ld.' + key); } catch { /* ignore */ } },
};
