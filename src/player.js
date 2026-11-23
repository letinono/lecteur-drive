// Lecteur : file d'attente, lecture aléatoire, répétition, préchargement et Media Session (écran verrouillé).
//
// Méthode de lecture : chaque fichier Drive est téléchargé en entier (Blob) puis lu via une URL blob: locale.
// - une balise <audio> ne peut pas envoyer l'en-tête Authorization ;
// - Safari iOS gère très bien les blobs (déplacement dans la piste compris) ;
// - une fois le fichier reçu, l'expiration du jeton ne coupe plus rien ;
// - la piste suivante est préchargée pendant la lecture : pas de blanc, et pas besoin de réseau à l'enchaînement
//   (important écran verrouillé, où iOS bride le JavaScript).
import { readTags } from './id3.js';
import { store } from './store.js';

const SILENT_SRC = makeSilentWav();
const AHEAD = 2; // nombre de pistes préchargées après la courante

function makeSilentWav() {
  const n = 800;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  let bin = '';
  new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b); });
  return 'data:audio/wav;base64,' + btoa(bin);
}

export const stripExt = (name) => name.replace(/\.[a-z0-9]{2,4}$/i, '');

export function createPlayer({ storage }) {
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.hidden = true;
  document.body.appendChild(audio);

  const s = {
    queue: [], order: [], pos: -1, shuffle: false, repeat: 'off',
    status: 'idle', // idle | loading | playing | paused | error
    error: '', errorCode: '', meta: null, time: 0, duration: 0,
  };
  const durations = store.get('dur', {}); // durées connues (id -> secondes), remplies au fil des lectures
  let durDirty = false;
  const listeners = new Set();
  const cache = new Map(); // id -> { ctrl, promise, url, cover, meta }
  let loadId = 0;
  let loadedTrackId = null; // piste actuellement chargée dans <audio>
  let resumeAt = 0;
  let unlocked = false;
  let lastSave = 0;
  let lastPos = 0;

  const emit = (kind = 'state') => listeners.forEach((fn) => { try { fn(s, kind); } catch { /* ignore */ } });
  const current = () => (s.pos >= 0 ? s.queue[s.order[s.pos]] : null);

  // ---------- file d'attente ----------
  function buildOrder(first) {
    const ids = s.queue.map((_, i) => i);
    if (!s.shuffle) { s.order = ids; s.pos = first; return; }
    const rest = ids.filter((i) => i !== first);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    s.order = [first, ...rest];
    s.pos = 0;
  }

  function nextPos(wrap) {
    if (s.pos + 1 < s.order.length) return s.pos + 1;
    return wrap || s.repeat === 'all' ? 0 : null;
  }

  // ---------- téléchargement / préchargement ----------
  function ensure(track) {
    const hit = cache.get(track.id);
    if (hit) return hit.promise;
    const e = { ctrl: new AbortController(), url: null, cover: null, meta: null };
    e.promise = (async () => {
      const blob = await storage.getBlob(track.id, { signal: e.ctrl.signal });
      const tags = await readTags(blob).catch(() => ({}));
      e.url = URL.createObjectURL(blob);
      if (tags.cover) e.cover = URL.createObjectURL(new Blob([tags.cover.data], { type: tags.cover.mime }));
      e.meta = { title: tags.title || stripExt(track.name), artist: tags.artist || '', album: tags.album || '', cover: e.cover, tech: tags.audio || null };
      return e;
    })();
    e.promise.catch(() => { if (cache.get(track.id) === e) cache.delete(track.id); });
    cache.set(track.id, e);
    return e.promise;
  }

  function trim() {
    const keep = new Set();
    for (let d = -1; d <= AHEAD; d++) {
      const t = s.queue[s.order[s.pos + d]];
      if (t) keep.add(t.id);
    }
    for (const [id, e] of cache) {
      if (keep.has(id)) continue;
      e.ctrl.abort();
      if (e.url) URL.revokeObjectURL(e.url);
      if (e.cover) URL.revokeObjectURL(e.cover);
      cache.delete(id);
    }
  }

  async function preload() {
    // une piste après l'autre : on ne sature pas le réseau et la suivante est prioritaire
    for (let d = 1; d <= AHEAD; d++) {
      let p = s.pos + d;
      if (p >= s.order.length) { if (s.repeat === 'all') p -= s.order.length; else return; }
      const t = s.queue[s.order[p]];
      if (!t) return;
      try { await ensure(t); } catch { return; }
    }
  }

  // ---------- chargement et lecture ----------
  function unlock() {
    // iOS n'autorise play() que sur un élément « activé » par un geste : on l'active ici (dans le tap),
    // puis les changements de src suivants (asynchrones, ou à l'enchaînement) restent autorisés.
    if (unlocked) return;
    unlocked = true;
    audio.src = SILENT_SRC;
    audio.play().catch(() => {});
  }

  async function load(autoplay, startAt = 0) {
    const track = current();
    if (!track) return;
    const my = ++loadId;
    s.status = 'loading'; s.error = ''; s.errorCode = '';
    s.meta = { title: stripExt(track.name), artist: '', album: '', cover: null };
    s.time = startAt; s.duration = 0;
    emit();
    let entry;
    try { entry = await ensure(track); }
    catch (e) {
      if (my !== loadId) return;
      s.status = 'error';
      s.errorCode = e.code || '';
      s.error = e.code ? 'Session Google expirée : reconnecte-toi.' : 'Impossible de charger cette piste.';
      emit();
      return;
    }
    if (my !== loadId) return;
    s.meta = entry.meta;
    loadedTrackId = track.id;
    audio.src = entry.url;
    if (startAt > 0) audio.addEventListener('loadedmetadata', () => { audio.currentTime = startAt; }, { once: true });
    updateMediaSession();
    trim();
    if (autoplay) {
      try { await audio.play(); }
      catch { if (my === loadId) { s.status = 'paused'; emit(); } }
    } else { s.status = 'paused'; emit(); }
    if (my === loadId) { emit(); preload(); }
  }

  const api = {
    state: s,
    audio,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    current,
    durationOf: (id) => durations[id] || 0,

    playQueue(tracks, startIndex = 0, { shuffle = s.shuffle } = {}) {
      if (!tracks.length) return;
      unlock();
      s.queue = tracks;
      s.shuffle = shuffle;
      buildOrder(startIndex);
      loadedTrackId = null; resumeAt = 0;
      persist(true);
      return load(true);
    },

    toggle() {
      const t = current();
      if (!t) return;
      unlock();
      if (loadedTrackId !== t.id) return load(true, resumeAt); // piste restaurée, pas encore téléchargée
      if (s.status === 'error') return load(true, audio.currentTime);
      return audio.paused ? audio.play().catch(() => {}) : audio.pause();
    },
    play() { if (audio.paused) return api.toggle(); },
    pause() { audio.pause(); },
    stop() {
      if (loadedTrackId) { audio.pause(); audio.currentTime = 0; }
      resumeAt = 0; s.time = 0; s.status = 'paused'; persist(true); emit();
    },

    next(auto = false) {
      if (!s.queue.length) return;
      unlock();
      if (auto && s.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
      const np = nextPos(!auto);
      if (np === null) { // fin de file
        s.status = 'paused'; audio.currentTime = 0; resumeAt = 0; persist(true); emit();
        return;
      }
      s.pos = np; loadedTrackId = null; resumeAt = 0; persist(true);
      return load(true);
    },

    prev() {
      if (!s.queue.length) return;
      unlock();
      if (audio.currentTime > 3 && loadedTrackId) { audio.currentTime = 0; return; }
      s.pos = s.pos > 0 ? s.pos - 1 : (s.repeat === 'all' ? s.order.length - 1 : 0);
      loadedTrackId = null; resumeAt = 0; persist(true);
      return load(true);
    },

    jump(pos) {
      if (pos < 0 || pos >= s.order.length) return;
      unlock();
      s.pos = pos; loadedTrackId = null; resumeAt = 0; persist(true);
      return load(true);
    },

    seek(t) {
      if (!loadedTrackId) { resumeAt = t; s.time = t; emit('time'); return; }
      audio.currentTime = Math.max(0, Math.min(t, audio.duration || t));
    },

    toggleShuffle() {
      s.shuffle = !s.shuffle;
      if (s.queue.length) {
        const cur = s.order[s.pos];
        buildOrder(cur);
        trim(); preload();
      }
      persist(true); emit();
    },

    cycleRepeat() {
      s.repeat = { off: 'all', all: 'one', one: 'off' }[s.repeat];
      persist(true); emit();
    },

    /** Réessaie la piste en erreur (après reconnexion par exemple). */
    retry() { if (s.status === 'error') return load(true, audio.currentTime || resumeAt); },

    restore() {
      const saved = store.get('player');
      if (!saved || !Array.isArray(saved.queue) || !saved.queue.length) return false;
      s.queue = saved.queue;
      s.shuffle = !!saved.shuffle;
      s.repeat = saved.repeat || 'off';
      s.order = Array.isArray(saved.order) && saved.order.length === saved.queue.length ? saved.order : saved.queue.map((_, i) => i);
      s.pos = Math.min(Math.max(saved.pos || 0, 0), s.order.length - 1);
      resumeAt = saved.time || 0;
      s.time = resumeAt;
      const t = current();
      s.meta = { title: stripExt(t.name), artist: '', album: '', cover: null };
      s.status = 'paused';
      emit();
      return true;
    },

    clear() {
      audio.pause(); audio.removeAttribute('src'); loadedTrackId = null;
      s.queue = []; s.order = []; s.pos = -1; s.status = 'idle'; s.meta = null;
      trim(); store.del('player'); emit();
    },
  };

  // ---------- sauvegarde ----------
  function persist(force = false) {
    if (durDirty) { durDirty = false; store.set('dur', durations); }
    const now = Date.now();
    if (!force && now - lastSave < 4000) return;
    lastSave = now;
    if (!s.queue.length) return;
    const time = loadedTrackId ? audio.currentTime : resumeAt;
    store.set('player', {
      queue: s.queue.map(({ id, name, size }) => ({ id, name, size })),
      order: s.order, pos: s.pos, shuffle: s.shuffle, repeat: s.repeat, time,
    });
  }

  // ---------- événements de l'élément audio ----------
  audio.addEventListener('playing', () => { if (loadedTrackId) { s.status = 'playing'; emit(); updatePlaybackState(); } });
  audio.addEventListener('pause', () => {
    if (!loadedTrackId || s.status === 'loading' || audio.ended) return;
    s.status = 'paused'; persist(true); emit(); updatePlaybackState();
  });
  audio.addEventListener('ended', () => api.next(true));
  audio.addEventListener('durationchange', () => {
    s.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (loadedTrackId && s.duration > 0 && durations[loadedTrackId] !== Math.round(s.duration)) {
      durations[loadedTrackId] = Math.round(s.duration);
      const keys = Object.keys(durations);
      if (keys.length > 3000) delete durations[keys[0]];
      durDirty = true; emit(); // la playlist affiche la durée dès qu'elle est connue
    }
    emit('time');
  });
  audio.addEventListener('timeupdate', () => {
    if (!loadedTrackId) return;
    s.time = audio.currentTime;
    s.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    emit('time');
    persist();
    const now = Date.now();
    if (now - lastPos > 1000) { lastPos = now; updatePositionState(); }
  });
  audio.addEventListener('error', () => {
    if (!loadedTrackId) return;
    s.status = 'error'; s.error = 'Ce fichier ne peut pas être lu.'; s.errorCode = 'decode'; emit();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(true); });
  window.addEventListener('pagehide', () => persist(true));

  // ---------- Media Session (commandes de l'écran verrouillé) ----------
  const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;
  function setHandler(action, fn) { try { ms.setActionHandler(action, fn); } catch { /* action non gérée */ } }
  if (ms) {
    setHandler('play', () => api.play());
    setHandler('pause', () => api.pause());
    setHandler('previoustrack', () => api.prev());
    setHandler('nexttrack', () => api.next());
    setHandler('seekto', (d) => { if (d.seekTime != null) api.seek(d.seekTime); });
  }
  function updatePlaybackState() { if (ms) ms.playbackState = audio.paused ? 'paused' : 'playing'; }
  function updatePositionState() {
    if (!ms?.setPositionState || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    try { ms.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) }); } catch { /* ignore */ }
  }
  function updateMediaSession() {
    if (!ms || !s.meta || typeof MediaMetadata === 'undefined') return;
    const icon = new URL('icons/icon-512.png', document.baseURI).href;
    ms.metadata = new MediaMetadata({
      title: s.meta.title,
      artist: s.meta.artist,
      album: s.meta.album,
      artwork: [{ src: s.meta.cover || icon, sizes: '512x512' }],
    });
  }

  return api;
}
