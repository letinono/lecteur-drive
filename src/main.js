import './styles/base.css';
import './styles/winamp.css';
import './styles/apple.css';
import { CLIENT_ID, ROOT_FOLDER_NAME } from './config.js';
import {
  consumeRedirectResult, getAuthState, hasStoredSession, isStandalone, onAuthChange,
  refreshSilently, signIn, signInRedirect, signOut,
} from './auth.js';
import { storage } from './storage/index.js';
import { createPlayer, stripExt } from './player.js';
import { mountPlayerUI, esc, fitMarquees, fmtDur } from './ui.js';
import { clearCache, collectTracks, forgetRoot, getRoot, list } from './library.js';
import { store } from './store.js';
import { THEMES, getTheme, setTheme } from './theme.js';

// Mise à jour : le service worker garde l'interface en cache ; quand une nouvelle version est installée,
// on recharge tout de suite si rien ne joue, sinon on propose de le faire.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // première installation : rien à recharger
    const playingNow = document.querySelector('audio') && !document.querySelector('audio').paused;
    if (!playingNow) { location.reload(); return; }
    const box = document.getElementById('update');
    if (box) box.innerHTML = '<strong>Nouvelle version disponible.</strong> <button class="wbtn txt" data-act="reload">Mettre à jour</button>';
  });
}

const view = document.getElementById('view');
const banner = document.getElementById('banner');
const player = createPlayer({ storage });
mountPlayerUI({ player, mini: document.getElementById('mini'), sheet: document.getElementById('sheet') });

let root = null;
let stack = []; // [{id,name}] — le premier élément est toujours le dossier racine
let listing = null;
let busy = '';
let message = '';
let showSettings = false;
let loginError = '';

const mmss = (ms) => `${Math.floor(ms / 60000)} min ${String(Math.floor(ms / 1000) % 60).padStart(2, '0')} s`;
const fmtSize = (b) => (b ? (b / 1048576).toFixed(1) + ' Mo' : '');
const currentTrackId = () => player.current()?.id;

// ---------- navigation ----------
async function openFolder(path) {
  busy = 'Chargement…'; message = ''; render();
  try {
    const last = path[path.length - 1];
    listing = await list(last.id);
    stack = path;
    store.set('path', path.slice(1));
  } catch (e) {
    if (e.status === 404) { forgetRoot(); root = null; return start(); }
    message = e.code ? 'Session Google expirée.' : 'Erreur de chargement : ' + e.message;
  }
  busy = '';
  render();
}

async function start() {
  busy = 'Recherche du dossier…'; render();
  try {
    root = await getRoot();
  } catch (e) {
    busy = ''; root = null; listing = null;
    message = e.code === 'no_root' ? e.message + ' Crée-le dans Google Drive, puis touche « Actualiser ».' : 'Erreur : ' + e.message;
    render();
    return;
  }
  const sub = store.get('path', []);
  const path = [root, ...(Array.isArray(sub) ? sub : [])];
  await openFolder(path);
  if (!listing && path.length > 1) await openFolder([root]); // dossier mémorisé disparu
}

async function playFolder({ shuffle }) {
  const here = stack[stack.length - 1];
  busy = 'Préparation de la lecture…'; render();
  try {
    const tracks = await collectTracks(here.id);
    busy = '';
    if (!tracks.length) { message = 'Aucun MP3 dans ce dossier.'; render(); return; }
    render();
    player.playQueue(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : 0, { shuffle });
  } catch (e) { busy = ''; message = 'Erreur : ' + e.message; render(); }
}

// ---------- affichage ----------
function renderBanner() {
  const st = getAuthState();
  const needed = !st.signedIn && (hasStoredSession() || player.state.queue.length || listing);
  if (!needed || !(listing || player.state.queue.length)) { banner.innerHTML = ''; return; }
  banner.innerHTML = `<strong>Session Google expirée.</strong> La piste en cours continue, mais les suivantes ne pourront pas se charger.
    <div class="row"><button class="wbtn txt big" data-act="signin">Reconnecter</button><button class="wbtn txt" data-act="redirect">Connexion alternative</button></div>
    ${loginError ? `<div class="err">${esc(loginError)}</div>` : ''}`;
}

function renderLogin() {
  const idMissing = CLIENT_ID.startsWith('VOTRE_');
  return `<section class="wa-window"><div class="wa-title"><h1>Lecteur Drive</h1></div><div class="wa-body center">
    <p class="muted">Écoute les MP3 du dossier « ${esc(ROOT_FOLDER_NAME)} » de ton Google Drive.<br>Accès en lecture seule.</p>
    ${idMissing ? '<p class="err">Identifiant client non configuré (src/config.js).</p>' : ''}
    <div class="row" style="justify-content:center"><button class="wbtn txt big" data-act="signin">Se connecter avec Google</button></div>
    <div class="row" style="justify-content:center"><button class="wbtn txt" data-act="redirect">Connexion alternative (même fenêtre)</button></div>
    ${loginError ? `<p class="err">${esc(loginError)}</p>` : ''}</div></section>`;
}

function renderSettings() {
  const st = getAuthState();
  return `<div class="diag"><strong>Réglages</strong>
    <div class="kv"><span>Mode app (écran d'accueil)</span><span>${isStandalone() ? 'oui' : 'non (Safari)'}</span></div>
    <div class="kv"><span>Jeton Google expire dans</span><span id="remaining">${st.signedIn ? mmss(st.remainingMs) : 'expiré'}</span></div>
    <div class="kv"><span>Version</span><span>${esc(typeof __BUILD__ === 'string' ? __BUILD__ : 'dev')}</span></div>
    <div class="kv"><span>Dossier</span><span>${esc(ROOT_FOLDER_NAME)}</span></div>
    <div class="kv"><span>Style</span><span class="themes">${Object.entries(THEMES).map(([k, v]) => `<button class="wbtn txt ${getTheme() === k ? 'on' : ''}" data-theme="${k}" aria-pressed="${getTheme() === k}">${esc(v)}</button>`).join('')}</span></div>
    <div class="row"><button class="wbtn txt" data-act="refresh">Actualiser les dossiers</button><button class="wbtn txt" data-act="renew">Tester le renouvellement</button><button class="wbtn txt" data-act="signout">Se déconnecter</button></div></div>`;
}

function render() {
  renderBanner();
  const st = getAuthState();
  if (!st.signedIn && !listing && !player.state.queue.length) { view.innerHTML = renderLogin(); return; }

  const apple = getTheme() === 'apple';
  const here = stack[stack.length - 1];
  const gear = `<button class="wa-x" data-act="settings" aria-label="Réglages" aria-expanded="${showSettings}"><svg viewBox="0 0 24 24"><path d="M19.4 13a7.6 7.6 0 000-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 00-1.7-1L15 3.4h-4l-.4 2.6a7.4 7.4 0 00-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 000 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 001.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 001.7-1l2.4 1 2-3.4zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"/></svg></button>`;
  const hue = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

  let html = '<section class="wa-window">';
  if (apple) {
    // barre de navigation iOS : « ‹ dossier parent » à gauche, réglages à droite, grand titre dessous
    const parent = stack.length > 1 ? stack[stack.length - 2].name : '';
    html += `<div class="navbar">${parent ? `<button class="navback" data-act="up" aria-label="Dossier parent : ${esc(parent)}"><span aria-hidden="true">‹</span> ${esc(parent)}</button>` : '<span></span>'}${gear}</div>
      <div class="wa-title"><h1>${esc(here ? here.name : ROOT_FOLDER_NAME)}</h1></div><div class="wa-body">`;
  } else {
    html += `<div class="wa-title"><h1>${esc(ROOT_FOLDER_NAME)}</h1>${gear}</div><div class="wa-body">`;
  }
  if (showSettings) html += renderSettings();

  if (stack.length && !apple) {
    const crumbs = stack.map((f, i) => (i === stack.length - 1 ? `<span>${esc(f.name)}</span>` : `<button data-crumb="${i}">${esc(f.name)}</button>`)).join(' › ');
    html += `<div class="crumbs lcd">${crumbs}</div>`;
  }
  if (listing) {
    const has = listing.folders.length || listing.tracks.length;
    html += apple
      ? `<div class="actions">
          <button class="wbtn txt" data-act="playfolder" ${has ? '' : 'disabled'}><span aria-hidden="true">▶</span> Lecture</button>
          <button class="wbtn txt" data-act="shufflefolder" ${has ? '' : 'disabled'}><span aria-hidden="true">⤮</span> Aléatoire</button></div>`
      : `<div class="row">
          <button class="wbtn txt" data-act="playfolder" ${has ? '' : 'disabled'}>▶ Lire le dossier</button>
          <button class="wbtn txt" data-act="shufflefolder" ${has ? '' : 'disabled'}>⤮ Aléatoire</button>
          ${stack.length > 1 ? '<button class="wbtn txt" data-act="up">⬆ Parent</button>' : ''}</div>`;
    const folderRow = (f, i) => `<li class="folder"><button data-folder="${i}">${apple ? `<span class="art" style="--h:${hue(f.name)}" aria-hidden="true">♪</span>` : ''}<span class="num" aria-hidden="true">${apple ? '›' : '▸'}</span><span class="name">${esc(f.name)}</span></button></li>`;
    const trackRow = (t, i) => `<li class="${t.id === currentTrackId() ? 'current' : ''}"><button data-track="${i}"><span class="num" aria-hidden="true">${t.id === currentTrackId() ? '▶' : String(i + 1) + (apple ? '' : '.')}</span><span class="name">${esc(stripExt(t.name))}</span><span class="muted dur">${fmtDur(player.durationOf(t.id)) || fmtSize(Number(t.size))}</span></button></li>`;
    if (apple) {
      if (listing.folders.length) html += `<h2 class="sec">Albums</h2><ul class="list wa-list">${listing.folders.map(folderRow).join('')}</ul>`;
      if (listing.tracks.length) html += `<h2 class="sec">Titres</h2><ul class="list wa-list">${listing.tracks.map(trackRow).join('')}</ul>`;
    } else {
      html += `<ul class="list wa-list">${listing.folders.map(folderRow).join('')}${listing.tracks.map(trackRow).join('')}</ul>`;
    }
    if (!has) html += '<p class="muted">Dossier vide (ni sous-dossier ni MP3).</p>';
  }
  if (busy) html += `<p class="muted spin" role="status">${esc(busy)}</p>`;
  if (message) html += `<p class="err" role="status">${esc(message)}</p>`;
  if (!listing && !busy && !message && st.signedIn) html += '<p class="muted">…</p>';
  if (message && !listing) html += '<div class="row"><button class="wbtn txt" data-act="refresh">Actualiser</button><button class="wbtn txt" data-act="signout">Se déconnecter</button></div>';
  html += '</div></section>';
  view.innerHTML = html;
  fitMarquees(view);
}

// ---------- événements ----------
async function doSignIn() {
  loginError = '';
  try { await signIn(); loginError = ''; }
  catch (e) { loginError = `Connexion impossible (${e.code || 'erreur'}) : ${e.message}. Essaie « Connexion alternative ».`; render(); }
}

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('#app button');
  if (!b) return;
  const d = b.dataset;
  if (d.theme) { setTheme(d.theme); render(); return; }
  if (d.folder !== undefined) return openFolder([...stack, listing.folders[Number(d.folder)]]);
  if (d.crumb !== undefined) return openFolder(stack.slice(0, Number(d.crumb) + 1));
  if (d.track !== undefined) {
    const i = Number(d.track);
    if (player.state.queue === listing.tracks && player.current()?.id === listing.tracks[i].id) return player.toggle();
    player.playQueue(listing.tracks, i, { shuffle: false });
    return;
  }
  switch (d.act) {
    case 'reload': location.reload(); break;
    case 'signin': await doSignIn(); break;
    case 'redirect': signInRedirect(); break;
    case 'settings': showSettings = !showSettings; render(); break;
    case 'playfolder': await playFolder({ shuffle: false }); break;
    case 'shufflefolder': await playFolder({ shuffle: true }); break;
    case 'up': openFolder(stack.slice(0, -1)); break;
    case 'refresh': clearCache(); message = ''; await start(); break;
    case 'renew':
      message = 'Renouvellement…'; render();
      try { await refreshSilently(); message = 'Renouvellement réussi ✔'; } catch (e) { message = 'Échec du renouvellement : ' + (e.code || e.message); }
      render(); break;
    case 'signout':
      signOut(); player.clear(); forgetRoot(); store.del('path'); root = null; listing = null; stack = []; message = ''; showSettings = false; render(); break;
    default:
  }
});

let wasSignedIn = getAuthState().signedIn;
onAuthChange((st) => {
  renderBanner();
  if (st.signedIn && !wasSignedIn) {
    loginError = '';
    renderBanner();
    if (!listing) start();
    player.retry();
  }
  wasSignedIn = st.signedIn;
  if (!st.signedIn && !listing) render();
});

let lastLocalPlayStatus = '';
player.on((s) => {
  // redessine la liste seulement si la piste ou l'état « lecture » change (pour l'indicateur ▶)
  const key = (currentTrackId() || '') + s.status;
  if (key !== lastLocalPlayStatus) { lastLocalPlayStatus = key; if (listing) render(); }
  if (s.status === 'error' && s.errorCode) renderBanner();
});

setInterval(() => {
  const el = document.getElementById('remaining');
  if (!el) return;
  const st = getAuthState();
  el.textContent = st.signedIn ? mmss(st.remainingMs) : 'expiré';
}, 1000);

// ---------- démarrage ----------
consumeRedirectResult();
wasSignedIn = getAuthState().signedIn;
player.restore();
render();
if (getAuthState().signedIn) {
  start();
} else if (hasStoredSession()) {
  // jeton expiré depuis la dernière ouverture : renouvellement discret (peut être refusé sans geste utilisateur)
  busy = 'Reconnexion…'; render();
  refreshSilently().then(() => { busy = ''; }, () => { busy = ''; render(); });
}
