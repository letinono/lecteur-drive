// Faux Google (GIS + API Drive) et faux MP3 pour tester l'app sans réseau ni compte.
const FOLDER = 'application/vnd.google-apps.folder';
const f = (id, name) => ({ id, name, mimeType: FOLDER });
const t = (id, name, size = '20000') => ({ id, name, mimeType: 'audio/mpeg', size });

export const TREE = {
  M: [f('f1', 'Album B'), f('f2', 'Album A'), t('t10', '10 - dix.mp3'), t('t2', '2 - deux.mp3')],
  f1: [t('b2', '02 Seconde.mp3'), t('b1', '01 Première.mp3')],
  f2: [t('a1', 'a1.mp3')],
};

// ---- faux MP3 : trames MPEG-1 Layer III silencieuses (417 octets, ~26 ms chacune) ----
const utf16 = (s) => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function frame(id, body) {
  const size = Buffer.alloc(4); size.writeUInt32BE(body.length);
  return Buffer.concat([Buffer.from(id), size, Buffer.from([0, 0]), body]);
}
function id3v23(tags) {
  const frames = [];
  if (tags.title) frames.push(frame('TIT2', utf16(tags.title)));
  if (tags.artist) frames.push(frame('TPE1', utf16(tags.artist)));
  if (tags.album) frames.push(frame('TALB', utf16(tags.album)));
  if (tags.cover) frames.push(frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/png\0'), Buffer.from([3, 0]), PNG])));
  const body = Buffer.concat(frames);
  const n = body.length;
  const sz = Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
  return Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 3, 0, 0]), sz, body]);
}
export function makeMp3({ seconds = 1.2, ...tags } = {}) {
  const frames = Math.round(seconds * 38.28);
  const one = Buffer.alloc(417); one.set([0xff, 0xfb, 0x90, 0x00]);
  const head = tags.title || tags.artist || tags.album || tags.cover ? id3v23(tags) : Buffer.alloc(0);
  return Buffer.concat([head, ...Array(frames).fill(one)]);
}

export const FILES = {
  b1: makeMp3({ title: 'Première (tag)', artist: 'Artiste Test', album: 'Album Test', cover: true }),
};

export async function mockGoogle(page, { failRefresh = false, noRoot = false } = {}) {
  const state = { listCalls: [], media: [], authHeaders: [], findCalls: 0 };
  await page.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.google={accounts:{oauth2:{initTokenClient:(cfg)=>({requestAccessToken:(o)=>{
      window.__gisCalls=(window.__gisCalls||[]);window.__gisCalls.push(o&&o.prompt);
      if(window.__failRefresh && o.prompt==='none'){cfg.callback({error:'interaction_required'});return;}
      if(window.__failRefresh){cfg.error_callback({type:'popup_failed_to_open',message:'bloqué'});return;}
      window.__n=(window.__n||0)+1;
      cfg.callback({access_token:'tok'+window.__n,expires_in:window.__expires||3600});}}),revoke:()=>{}}}};`,
  }));
  await page.addInitScript((fr) => {
    window.__failRefresh = fr;
    // espions : gestionnaires Media Session et URL blob libérées
    window.__ms = {};
    if (navigator.mediaSession) {
      const orig = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      navigator.mediaSession.setActionHandler = (a, h) => { window.__ms[a] = h; orig(a, h); };
    }
    window.__revoked = 0;
    const rev = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (u) => { window.__revoked++; rev(u); };
  }, failRefresh);
  await page.route('https://www.googleapis.com/drive/v3/files**', (route) => {
    const url = new URL(route.request().url());
    state.authHeaders.push(route.request().headers()['authorization']);
    const id = url.pathname.split('/').pop();
    if (url.searchParams.get('alt') === 'media') {
      state.media.push(id);
      return route.fulfill({ contentType: 'audio/mpeg', body: FILES[id] || makeMp3() });
    }
    const q = url.searchParams.get('q') || '';
    if (q.includes("name='Musique'")) {
      state.findCalls++;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ files: noRoot ? [] : [{ id: 'M', name: 'Musique' }] }) });
    }
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    state.listCalls.push(parent);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ files: TREE[parent] || [] }) });
  });
  return state;
}

export async function login(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  await page.locator('.list li').first().waitFor();
}
