// Mini-lecteur et lecteur plein écran. Les mises à jour de temps ne redessinent rien : elles modifient quelques nœuds.
import { stripExt } from './player.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 6l9 6-9 6zM16 6h2v12h-2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M18 6l-9 6 9 6zM6 6h2v12H6z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M17 3l4 4-4 4V8h-2.6l-3 4.2L14.4 16H17v-3l4 4-4 4v-3h-3.6L9 12.6 5.2 17H3v-2h1.2l3.6-4.4L4.2 6H3V4h2.2l4 5L12.6 5H17z"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M5.4 8.6L12 15.2l6.6-6.6 1.4 1.4-8 8-8-8z"/></svg>',
};
export { I as icons };

const mmss = (t) => {
  if (!Number.isFinite(t)) return '0:00';
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function mountPlayerUI({ player, mini, sheet }) {
  let dragging = false;
  const s = player.state;

  const coverHtml = (cls) => (s.meta?.cover ? `<img class="${cls}" src="${esc(s.meta.cover)}" alt="">` : `<div class="${cls} ph" aria-hidden="true">♪</div>`);
  const playIcon = () => (s.status === 'playing' ? I.pause : I.play);
  const playLabel = () => (s.status === 'playing' ? 'Pause' : 'Lecture');

  function renderMini() {
    document.body.classList.toggle('no-player', !s.queue.length);
    if (!s.queue.length) { mini.innerHTML = ''; return; }
    const sub = s.status === 'loading' ? 'Chargement…' : s.status === 'error' ? s.error : [s.meta?.artist, s.meta?.album].filter(Boolean).join(' — ');
    mini.innerHTML = `<div class="mini">
      <div class="bar" id="mini-bar"></div>
      <button class="info" data-pl="open" aria-label="Ouvrir le lecteur">${coverHtml('cover')}
        <span class="t"><b>${esc(s.meta?.title || '')}</b><span class="muted ${s.status === 'error' ? 'err' : ''}">${esc(sub)}</span></span></button>
      <button class="icon" data-pl="toggle" aria-label="${playLabel()}">${playIcon()}</button>
      <button class="icon" data-pl="next" aria-label="Piste suivante">${I.next}</button></div>`;
    updateTime();
  }

  function renderSheet() {
    if (sheet.hidden) return;
    if (!s.queue.length) { sheet.hidden = true; return; }
    const sub = [s.meta?.artist, s.meta?.album].filter(Boolean).join(' — ');
    const rep = s.repeat === 'one' ? ' (une piste)' : s.repeat === 'all' ? ' (tout)' : '';
    const q = s.order.map((qi, p) => {
      const t = s.queue[qi];
      return `<li class="${p === s.pos ? 'current' : ''}"><button data-pl="jump" data-pos="${p}"><span class="muted">${p + 1}</span><span class="name">${esc(stripExt(t.name))}</span></button></li>`;
    }).join('');
    sheet.innerHTML = `<div class="sheet-inner">
      <button class="icon" data-pl="close" aria-label="Fermer le lecteur">${I.down}</button>
      ${coverHtml('big-cover')}
      <p class="title">${esc(s.meta?.title || '')}</p>
      <p class="sub">${esc(sub) || '&nbsp;'}</p>
      ${s.status === 'error' ? `<p class="err" role="alert">${esc(s.error)}</p>` : ''}
      <input id="seek" class="seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Position dans la piste">
      <div class="times"><span id="t-cur">0:00</span><span id="t-dur">0:00</span></div>
      <div class="controls">
        <button class="icon ${s.shuffle ? 'on' : ''}" data-pl="shuffle" aria-label="Lecture aléatoire ${s.shuffle ? 'activée' : 'désactivée'}" aria-pressed="${s.shuffle}">${I.shuffle}</button>
        <button class="icon" data-pl="prev" aria-label="Piste précédente">${I.prev}</button>
        <button class="icon main" data-pl="toggle" aria-label="${playLabel()}">${playIcon()}</button>
        <button class="icon" data-pl="next" aria-label="Piste suivante">${I.next}</button>
        <button class="icon ${s.repeat !== 'off' ? 'on' : ''}" data-pl="repeat" aria-label="Répétition${rep || ' désactivée'}">${I.repeat}${s.repeat === 'one' ? '<small>1</small>' : ''}</button>
      </div>
      <p class="queue-title">File d'attente — ${s.order.length} piste${s.order.length > 1 ? 's' : ''}${s.shuffle ? ' (aléatoire)' : ''}</p>
      <ul class="list">${q}</ul></div>`;
    updateTime();
    sheet.querySelector('.list .current')?.scrollIntoView({ block: 'nearest' });
  }

  function updateTime() {
    const dur = s.duration || 0;
    const bar = document.getElementById('mini-bar');
    if (bar) bar.style.width = dur ? `${Math.min(100, (s.time / dur) * 100)}%` : '0';
    if (sheet.hidden || dragging) return;
    const seek = document.getElementById('seek');
    if (seek) seek.value = dur ? Math.round((s.time / dur) * 1000) : 0;
    const cur = document.getElementById('t-cur'); if (cur) cur.textContent = mmss(s.time);
    const du = document.getElementById('t-dur'); if (du) du.textContent = mmss(dur);
  }

  const openSheet = () => { sheet.hidden = false; renderSheet(); };
  const closeSheet = () => { sheet.hidden = true; };

  function onClick(ev) {
    const b = ev.target.closest('[data-pl]');
    if (!b) return;
    switch (b.dataset.pl) {
      case 'open': openSheet(); break;
      case 'close': closeSheet(); break;
      case 'toggle': player.toggle(); break;
      case 'next': player.next(); break;
      case 'prev': player.prev(); break;
      case 'shuffle': player.toggleShuffle(); break;
      case 'repeat': player.cycleRepeat(); break;
      case 'jump': player.jump(Number(b.dataset.pos)); break;
      default:
    }
  }
  mini.addEventListener('click', onClick);
  sheet.addEventListener('click', onClick);

  sheet.addEventListener('input', (ev) => {
    if (ev.target.id !== 'seek') return;
    dragging = true;
    const cur = document.getElementById('t-cur');
    if (cur) cur.textContent = mmss((ev.target.value / 1000) * (s.duration || 0));
  });
  sheet.addEventListener('change', (ev) => {
    if (ev.target.id !== 'seek') return;
    player.seek((ev.target.value / 1000) * (s.duration || 0));
    dragging = false;
  });

  player.on((_, kind) => {
    if (kind === 'time') { updateTime(); return; }
    renderMini();
    renderSheet();
  });
  renderMini();
  return { openSheet, closeSheet };
}
