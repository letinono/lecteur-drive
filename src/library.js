// Bibliothèque : dossier racine « Musique » (retrouvé par son nom) et navigation en dessous uniquement.
import { storage } from './storage/index.js';
import { ROOT_FOLDER_NAME } from './config.js';
import { store } from './store.js';

const cache = new Map(); // id -> Promise<{folders, tracks}> (pour la session)

export async function getRoot() {
  const saved = store.get('root');
  if (saved && saved.name === ROOT_FOLDER_NAME) return saved;
  const f = await storage.findFolder(ROOT_FOLDER_NAME);
  if (!f) {
    const e = new Error(`Dossier « ${ROOT_FOLDER_NAME} » introuvable à la racine de ton Drive.`);
    e.code = 'no_root';
    throw e;
  }
  const root = { id: f.id, name: f.name };
  store.set('root', root);
  return root;
}

export function forgetRoot() { store.del('root'); cache.clear(); }

export function list(id, { force = false } = {}) {
  if (force) cache.delete(id);
  if (!cache.has(id)) {
    const p = storage.listChildren(id);
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return cache.get(id);
}

export function clearCache() { cache.clear(); }

/** Toutes les pistes d'un dossier puis de ses sous-dossiers (ordre : pistes du dossier, puis sous-dossiers par nom). */
export async function collectTracks(id) {
  const { folders, tracks } = await list(id);
  const out = [...tracks];
  for (const f of folders) out.push(...(await collectTracks(f.id)));
  return out;
}
