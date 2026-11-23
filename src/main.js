// PROTOTYPE (étape 1) : connexion Google + navigation dans le Drive + test de lecture d'un MP3 en blob.
// Sert à vérifier sur iPhone, depuis l'écran d'accueil, que la connexion fonctionne.
import './style.css';
import { CLIENT_ID } from './config.js';
import { consumeRedirectResult, getAuthState, isStandalone, onAuthChange, refreshSilently, signIn, signInRedirect, signOut } from './auth.js';
import { storage } from './storage/index.js';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

const app = document.getElementById('app');
const FOLDER_KEY = 'ld.rootFolder';
const stack = []; // [{id,name}]
let message = '';
let isError = false;
let listing = null;
let nowPlaying = '';
let audioEl = null;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtSize = (b) => (b ? (b / 1048576).toFixed(1) + ' Mo' : '');
const mmss = (ms) => `${Math.floor(ms / 60000)} min ${String(Math.floor(ms / 1000) % 60).padStart(2, '0')} s`;

function setMsg(m, err = false) { message = m; isError = err; render(); }

function loadRoot() {
  try { return JSON.parse(localStorage.getItem(FOLDER_KEY)); } catch { return null; }
}

async function openFolder(id, name, pushToStack = true) {
  setMsg('Chargement…');
  try {
    listing = await storage.listChildren(id);
    if (pushToStack) stack.push({ id, name });
    setMsg('');
  } catch (e) { setMsg('Erreur : ' + e.message, true); }
}

async function goUp(index) {
  stack.length = index + 1;
  const f = stack[index];
  stack.pop();
  await openFolder(f.id, f.name);
}

async function testSilent() {
  setMsg('Renouvellement silencieux…');
  try { await refreshSilently(); setMsg('Renouvellement réussi ✔'); }
  catch (e) { setMsg('Échec du renouvellement : ' + (e.code || e.message), true); }
}

async function playTrack(t) {
  setMsg(`Téléchargement de « ${t.name} »…`);
  const t0 = performance.now();
  try {
    const blob = await storage.getBlob(t.id);
    audioEl.src = URL.createObjectURL(blob);
    await audioEl.play();
    nowPlaying = t.name;
    setMsg(`Lecture en cours — ${fmtSize(blob.size)} téléchargés en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) { setMsg('Erreur lecture : ' + (e.message || e), true); }
}

function render() {
  const st = getAuthState();
  const idMissing = CLIENT_ID.startsWith('VOTRE_');
  let html = '<h1>Lecteur Drive</h1>';
  if (idMissing) html += '<p class="err">Identifiant client non configuré : voir <code>src/config.js</code> et le README.</p>';
  if (!st.signedIn) {
    html += `<p>Connecte-toi pour accéder à ton Drive (lecture seule).</p>
      <div class="row"><button class="primary" data-act="signin">Se connecter avec Google</button>
      <button data-act="redirect">Connexion alternative (même fenêtre)</button></div>`;
  } else {
    const crumbs = ['Mon Drive', ...stack.map((s) => s.name)].map(esc).join(' › ');
    html += `<div class="row">
      <button data-act="root">Mon Drive</button>
      ${stack.length ? '<button data-act="up">⬆ Dossier parent</button>' : ''}
      ${stack.length ? '<button data-act="setroot">Choisir comme racine</button>' : ''}
    </div><div class="crumbs">${crumbs}</div>`;
    if (listing) {
      html += '<ul class="list">' +
        listing.folders.map((f) => `<li><button data-folder="${esc(f.id)}" data-name="${esc(f.name)}">📁 ${esc(f.name)}</button></li>`).join('') +
        listing.tracks.map((t) => `<li><button data-track="${esc(t.id)}" data-name="${esc(t.name)}">🎵 <span>${esc(t.name)}<br><span class="muted">${fmtSize(Number(t.size))}</span></span></button></li>`).join('') +
        '</ul>';
      if (!listing.folders.length && !listing.tracks.length) html += '<p class="muted">Dossier vide (ni sous-dossier ni MP3).</p>';
    }
    html += `<audio controls playsinline></audio>`;
  }
  if (message) html += `<p class="${isError ? 'err' : ''}" role="status">${esc(message)}</p>`;
  const root = loadRoot();
  html += `<div class="diag"><strong>Diagnostic</strong>
    <div><span>Mode app (écran d'accueil)</span><span>${isStandalone() ? 'oui' : 'non (Safari)'}</span></div>
    <div><span>Connecté</span><span>${st.signedIn ? 'oui' : 'non'}</span></div>
    <div><span>Jeton expire dans</span><span id="remaining">${st.signedIn ? mmss(st.remainingMs) : '—'}</span></div>
    <div><span>Dossier racine</span><span>${root ? esc(root.name) : 'aucun'}</span></div>
    ${nowPlaying ? `<div><span>Piste</span><span>${esc(nowPlaying)}</span></div>` : ''}
    ${st.signedIn ? '<div class="row"><button data-act="silent">Tester le renouvellement</button><button data-act="signout">Se déconnecter</button></div>' : ''}
  </div>`;
  const keepSrc = audioEl && audioEl.src && !audioEl.ended ? audioEl : null;
  app.innerHTML = html;
  const fresh = app.querySelector('audio');
  if (fresh) { if (keepSrc) fresh.replaceWith(keepSrc); audioEl = app.querySelector('audio'); }
}

app.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.folder) return openFolder(b.dataset.folder, b.dataset.name);
  if (b.dataset.track) return playTrack({ id: b.dataset.track, name: b.dataset.name });
  switch (b.dataset.act) {
    case 'signin':
      try { setMsg('Ouverture de la fenêtre Google…'); await signIn(); await openRoot(); }
      catch (e) { setMsg(`Connexion impossible (${e.code || ''}) : ${e.message}. Essaie « Connexion alternative ».`, true); }
      break;
    case 'redirect': signInRedirect(); break;
    case 'root': stack.length = 0; await openRoot(); break;
    case 'up': stack.pop(); { const p = stack.pop(); if (p) await openFolder(p.id, p.name); else await openRoot(); } break;
    case 'setroot': localStorage.setItem(FOLDER_KEY, JSON.stringify(stack[stack.length - 1])); setMsg('Dossier racine mémorisé ✔'); break;
    case 'silent': await testSilent(); break;
    case 'signout': signOut(); listing = null; stack.length = 0; render(); break;
  }
});

async function openRoot() {
  const r = loadRoot();
  stack.length = 0;
  if (r) { await openFolder(r.id, r.name); } else { await openFolder('root', 'Mon Drive', false); }
}

onAuthChange(() => { const el = document.getElementById('remaining'); if (!el) render(); });
setInterval(() => {
  const el = document.getElementById('remaining');
  const st = getAuthState();
  if (el && st.signedIn) el.textContent = mmss(st.remainingMs);
  else if (el && !st.signedIn && el.textContent !== '—') render();
}, 1000);

consumeRedirectResult();
render();
if (getAuthState().signedIn) openRoot();
