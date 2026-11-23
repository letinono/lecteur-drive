// Source de fichiers : Google Drive (lecture seule).
// Toute l'app passe par l'interface de src/storage/index.js ; un cache local (hors ligne)
// pourra remplacer ou compléter cette source sans toucher au reste.
import { getValidToken, refreshSilently } from '../auth.js';

const API = 'https://www.googleapis.com/drive/v3/files';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function authedFetch(url, init = {}) {
  let res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: 'Bearer ' + (await getValidToken()) } });
  if (res.status === 401) { // jeton révoqué/expiré côté Google : un seul nouvel essai
    await refreshSilently();
    res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: 'Bearer ' + (await getValidToken()) } });
  }
  if (!res.ok) {
    const err = new Error(`Drive ${res.status}`); err.status = res.status; throw err;
  }
  return res;
}

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
export const byName = (a, b) => collator.compare(a.name, b.name);

function isAudio(f) {
  return (f.mimeType || '').startsWith('audio/') || /\.mp3$/i.test(f.name);
}

export const driveSource = {
  /** Liste les sous-dossiers et les MP3 d'un dossier, triés par nom (ordre « naturel » : 2 avant 10). */
  async listChildren(folderId = 'root') {
    const out = [];
    let pageToken;
    do {
      const q = `'${folderId}' in parents and trashed=false and (mimeType='${FOLDER_MIME}' or mimeType contains 'audio/' or name contains '.mp3')`;
      const params = new URLSearchParams({
        q, pageSize: '1000', orderBy: 'name',
        fields: 'nextPageToken,files(id,name,mimeType,size)',
        supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await (await authedFetch(`${API}?${params}`)).json();
      out.push(...data.files);
      pageToken = data.nextPageToken;
    } while (pageToken);
    const folders = out.filter((f) => f.mimeType === FOLDER_MIME).sort(byName);
    const tracks = out.filter((f) => f.mimeType !== FOLDER_MIME && isAudio(f)).sort(byName);
    return { folders, tracks };
  },

  async getMeta(id) {
    const res = await authedFetch(`${API}/${id}?fields=id,name,mimeType,size&supportsAllDrives=true`);
    return res.json();
  },

  /** Télécharge un fichier complet en Blob (lecture fiable sur iOS, indépendante de l'expiration du jeton). */
  async getBlob(id, { signal } = {}) {
    const res = await authedFetch(`${API}/${id}?alt=media&supportsAllDrives=true`, { signal });
    const blob = await res.blob();
    return blob.type ? blob : new Blob([blob], { type: 'audio/mpeg' });
  },
};
