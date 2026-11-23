// Mini-lecteur et lecteur plein écran (style « Winamp »). Les mises à jour de temps ne redessinent rien :
// elles modifient quelques nœuds.
import { stripExt } from './player.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M5 5l10 7-10 7zM16 5h3v14h-3z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M19 5l-10 7 10 7zM5 5h3v14H5z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M17 3l4 4-4 4V8h-2.6l-3 4.2L14.4 16H17v-3l4 4-4 4v-3h-3.6L9 12.6 5.2 17H3v-2h1.2l3.6-4.4L4.2 6H3V4h2.2l4 5L12.6 5H17z"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M5.4 8.6L12 15.2l6.6-6.6 1.4 1.4-8 8-8-8z"/></svg>',
};
export { I as icons };

// Spectre décoratif (CSS). Un vrai analyseur audio (Web Audio) casserait la lecture en arrière-plan sur iOS.
const bars = (n) => Array.from({ length: n }, (_, i) => `<i style="--h:${(0.35 + ((i * 37) % 60) / 100).toFixed(2)};--s:${(0.45 + ((i * 53) % 70) / 100).toFixed(2)}s;--o:-${((i * 29) % 90) / 100}s"></i>`).join('');
const VIZ = (n) => `<div class="viz" aria-hidden="true">${bars(n)}</div>`;

const mmss = (t) => {
  if (!Number.isFinite(t) || t < 0) return '00:00';
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};

/** Fait défiler le texte (aller-retour) s'il est plus large que son cadre. */
export function fitMarquees(root = document) {
  root.querySelectorAll('.marquee').forEach((m) => {
    const inner = m.firstElementChild;
    if (!inner) return;
    const over = inner.scrollWidth - m.clientWidth;
    m.classList.toggle('scroll', over > 4);
    m.style.setProperty('--dx', `${-(over + 12)}px`);
    m.style.setProperty('--dur', `${Math.max(6, (over + 12) / 22)}s`);
  });
}

export function mountPlayerUI({ player, mini, sheet }) {
  let dragging = false;
  const s = player.state;

  const coverHtml = (cls) => (s.meta?.cover ? `<img class="${cls}" src="${esc(s.meta.cover)}" alt="">` : `<div class="${cls} ph" aria-hidden="true">♪</div>`);
  const playing = () => s.status === 'playing';

  function renderMini() {
    document.body.classList.toggle('no-player', !s.queue.length);
    if (!s.queue.length) { mini.innerHTML = ''; return; }
    const sub = s.status === 'loading' ? 'CHARGEMENT…' : s.status === 'error' ? s.error : [s.meta?.artist, s.meta?.album].filter(Boolean).join(' — ');
    mini.innerHTML = `<div class="mini ${playing() ? 'playing' : ''}">
      <div class="bar" id="mini-bar"></div>
      <button class="info" data-pl="open" aria-label="Ouvrir le lecteur">${coverHtml('cover')}
        <span class="t lcd"><span class="marquee"><span><b>${esc(s.meta?.title || '')}</b></span></span>
        <span class="muted ${s.status === 'error' ? 'err' : ''}">${esc(sub) || '&nbsp;'}</span></span></button>
      <button class="wbtn only-winamp" data-pl="prev" aria-label="Piste précédente">${I.prev}</button>
      <button class="wbtn" data-pl="toggle" aria-label="${playing() ? 'Pause' : 'Lecture'}">${playing() ? I.pause : I.play}</button>
      <button class="wbtn" data-pl="next" aria-label="Piste suivante">${I.next}</button></div>`;
    updateTime();
    fitMarquees(mini);
  }

  function renderSheet() {
    if (sheet.hidden) return;
    if (!s.queue.length) { sheet.hidden = true; return; }
    const sub = [s.meta?.artist, s.meta?.album].filter(Boolean).join(' — ');
    const rep = s.repeat === 'one' ? ' (une piste)' : s.repeat === 'all' ? ' (tout)' : '';
    const status = s.status === 'loading' ? '…' : s.status === 'playing' ? '▶' : s.status === 'error' ? '!' : s.time > 0 ? '❚❚' : '■';
    const q = s.order.map((qi, p) => {
      const t = s.queue[qi];
      return `<li class="${p === s.pos ? 'current' : ''}"><button data-pl="jump" data-pos="${p}"><span class="num">${p + 1}.</span><span class="name">${esc(stripExt(t.name))}</span></button></li>`;
    }).join('');
    sheet.innerHTML = `<div class="sheet-inner ${playing() ? 'playing' : ''}">
      <section class="wa-window player-window">
        <div class="wa-title"><span>Lecteur Drive</span><button class="wa-x" data-pl="close" aria-label="Fermer le lecteur">${I.down}</button></div>
        <div class="wa-body">
          <div class="lcd-row">
            <div class="lcd main-lcd"><span class="state" aria-hidden="true">${status}</span><span class="time js-cur" aria-label="Temps écoulé">00:00</span>${VIZ(22)}</div>
            ${coverHtml('big-cover')}
          </div>
          <div class="lcd marquee-lcd"><span class="marquee"><span class="title">${esc(s.meta?.title || '')}</span></span></div>
          <div class="lcd info-lcd"><span class="marquee"><span>${esc(sub) || '&nbsp;'}</span></span><span class="tot">Total <b class="js-dur">00:00</b></span></div>
          ${s.status === 'error' ? `<p class="err" role="alert">${esc(s.error)}</p>` : ''}
          <input id="seek" class="seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Position dans la piste">
          <div class="times" aria-hidden="true"><span class="js-cur">00:00</span><span class="js-dur">00:00</span></div>
          <div class="controls">
            <button class="wbtn only-winamp" data-pl="prev" aria-label="Piste précédente">${I.prev}</button>
            <button class="wbtn only-winamp ${playing() ? 'on' : ''}" data-pl="play" aria-label="Lecture">${I.play}</button>
            <button class="wbtn only-winamp" data-pl="pause" aria-label="Pause">${I.pause}</button>
            <button class="wbtn only-winamp" data-pl="stop" aria-label="Arrêt">${I.stop}</button>
            <button class="wbtn only-winamp" data-pl="next" aria-label="Piste suivante">${I.next}</button>
            <span class="gap only-winamp"></span>
            <button class="wbtn txt c-shuffle ${s.shuffle ? 'on' : ''}" data-pl="shuffle" aria-label="Lecture aléatoire ${s.shuffle ? 'activée' : 'désactivée'}" aria-pressed="${s.shuffle}"><span class="ico">${I.shuffle}</span><span class="lbl">Shuf</span></button>
            <button class="wbtn txt c-repeat ${s.repeat !== 'off' ? 'on' : ''}" data-pl="repeat" aria-label="Répétition${rep || ' désactivée'}"><span class="ico">${I.repeat}</span><span class="lbl">Rep${s.repeat === 'one' ? ' 1' : ''}</span></button>
            <button class="wbtn only-apple c-prev" data-pl="prev" aria-label="Piste précédente">${I.prev}</button>
            <button class="wbtn only-apple c-toggle" data-pl="toggle" aria-label="${playing() ? 'Pause' : 'Lecture'}">${playing() ? I.pause : I.play}</button>
            <button class="wbtn only-apple c-next" data-pl="next" aria-label="Piste suivante">${I.next}</button>
          </div>
        </div>
      </section>
      <section class="wa-window">
        <div class="wa-title"><span>Playlist — ${s.order.length} piste${s.order.length > 1 ? 's' : ''}${s.shuffle ? ' · aléatoire' : ''}</span></div>
        <ul class="list wa-list">${q}</ul>
      </section></div>`;
    updateTime();
    fitMarquees(sheet);
    sheet.querySelector('.list .current')?.scrollIntoView({ block: 'nearest' });
  }

  function updateTime() {
    const dur = s.duration || 0;
    const bar = document.getElementById('mini-bar');
    if (bar) bar.style.width = dur ? `${Math.min(100, (s.time / dur) * 100)}%` : '0';
    if (sheet.hidden || dragging) return;
    const seek = document.getElementById('seek');
    const pct = dur ? Math.min(1, s.time / dur) : 0;
    if (seek) { seek.value = Math.round(pct * 1000); seek.style.setProperty('--p', `${pct * 100}%`); }
    sheet.querySelectorAll('.js-cur').forEach((e) => { e.textContent = mmss(s.time); });
    sheet.querySelectorAll('.js-dur').forEach((e) => { e.textContent = mmss(dur); });
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
      case 'play': player.play(); break;
      case 'pause': player.pause(); break;
      case 'stop': player.stop(); break;
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
    ev.target.style.setProperty('--p', `${ev.target.value / 10}%`);
    sheet.querySelectorAll('.js-cur').forEach((e) => { e.textContent = mmss((ev.target.value / 1000) * (s.duration || 0)); });
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
