// Authentification Google (Google Identity Services, modèle « jeton », sans serveur).
// - Connexion principale : fenêtre GIS (pop-up).
// - Repli : redirection OAuth « implicite » dans la même fenêtre (utile si le pop-up est
//   bloqué dans l'app installée sur l'écran d'accueil iOS).
// Le jeton (valable ~1 h) est gardé en localStorage pour survivre à la fermeture de l'app.
import { CLIENT_ID, SCOPE } from './config.js';

const TOKEN_KEY = 'ld.token';
const STATE_KEY = 'ld.oauthState';
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // on renouvelle 5 min avant l'expiration

let token = readStored(); // { access_token, expires_at }
let tokenClient = null;
let pending = null; // { resolve, reject } de la demande GIS en cours
let refreshPromise = null;
let timer = null;
const listeners = new Set();

export class AuthError extends Error {
  constructor(message, code) { super(message); this.name = 'AuthError'; this.code = code; }
}

function readStored() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY));
    return t && t.access_token && t.expires_at ? t : null;
  } catch { return null; }
}

function setToken(access_token, expiresInSec) {
  token = { access_token, expires_at: Date.now() + Number(expiresInSec) * 1000 };
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(token)); } catch { /* stockage indisponible */ }
  scheduleRefresh();
  emit();
}

function emit() { listeners.forEach((fn) => { try { fn(getAuthState()); } catch { /* ignore */ } }); }

export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function getAuthState() {
  const remaining = token ? token.expires_at - Date.now() : 0;
  return { signedIn: remaining > 0, remainingMs: Math.max(0, remaining) };
}

/** Vrai si un jeton a déjà été obtenu sur cet appareil (même expiré) : on tente alors un renouvellement discret. */
export function hasStoredSession() { return token !== null; }

export function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function signOut() {
  const old = token;
  token = null;
  clearTimeout(timer);
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  if (old) window.google?.accounts?.oauth2?.revoke?.(old.access_token, () => {});
  emit();
}

// ---------- Chargement de GIS ----------
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new AuthError('Impossible de charger Google Identity Services (réseau ?)', 'gis_load'));
    document.head.appendChild(s);
  });
}

async function getClient() {
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        const p = pending; pending = null;
        if (!p) return;
        if (resp.error || !resp.access_token) {
          p.reject(new AuthError(resp.error_description || resp.error || 'Connexion refusée', resp.error || 'denied'));
        } else {
          setToken(resp.access_token, resp.expires_in);
          p.resolve(token.access_token);
        }
      },
      error_callback: (err) => {
        const p = pending; pending = null;
        p?.reject(new AuthError(err?.message || 'Pop-up impossible', err?.type || 'popup_failed'));
      },
    });
  }
  return tokenClient;
}

function request(prompt) {
  return getClient().then((client) => new Promise((resolve, reject) => {
    pending = { resolve, reject };
    client.requestAccessToken({ prompt });
  }));
}

/** Connexion interactive : à appeler depuis un tap de l'utilisateur. */
export function signIn() { return request(''); }

/** Renouvellement silencieux (peut échouer si aucun geste utilisateur : pop-up bloqué). */
export function refreshSilently() {
  if (!refreshPromise) {
    refreshPromise = request('none')
      .catch(() => request('')) // 2e essai : sans « none »
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

function scheduleRefresh() {
  clearTimeout(timer);
  if (!token) return;
  const delay = Math.max(5000, token.expires_at - Date.now() - REFRESH_MARGIN_MS);
  timer = setTimeout(() => {
    refreshSilently().catch(() => emit()); // en cas d'échec l'interface affichera « Reconnecter »
  }, delay);
}

/** Renvoie un jeton valide, en le renouvelant si besoin. Lève AuthError si impossible. */
export async function getValidToken() {
  if (token && token.expires_at - Date.now() > 60_000) return token.access_token;
  try { return await refreshSilently(); }
  catch (e) { emit(); throw e instanceof AuthError ? e : new AuthError(String(e), 'refresh_failed'); }
}

// ---------- Repli : redirection dans la même fenêtre ----------
export function signInRedirect() {
  const state = crypto.randomUUID();
  try { localStorage.setItem(STATE_KEY, state); } catch { /* ignore */ }
  const redirect = location.origin + location.pathname;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'true',
  });
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + params);
}

/** À appeler au démarrage : récupère le jeton si on revient d'une redirection OAuth. */
export function consumeRedirectResult() {
  if (!location.hash.includes('access_token')) return false;
  const p = new URLSearchParams(location.hash.slice(1));
  const ok = p.get('state') && p.get('state') === localStorage.getItem(STATE_KEY);
  history.replaceState(null, '', location.pathname + location.search);
  if (!ok || !p.get('access_token')) return false;
  try { localStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
  setToken(p.get('access_token'), p.get('expires_in') || 3600);
  return true;
}

if (token) scheduleRefresh();
