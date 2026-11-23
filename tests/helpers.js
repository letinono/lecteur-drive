// Faux Google (GIS + API Drive) pour tester l'app sans réseau ni compte.
export const TREE = {
  root: [
    { id: 'f1', name: 'Album B', mimeType: 'application/vnd.google-apps.folder' },
    { id: 'f2', name: 'Album A', mimeType: 'application/vnd.google-apps.folder' },
    { id: 't10', name: '10 - dix.mp3', mimeType: 'audio/mpeg', size: '1000' },
    { id: 't2', name: '2 - deux.mp3', mimeType: 'audio/mpeg', size: '1000' },
  ],
  f1: [{ id: 't1', name: 'Piste 1.mp3', mimeType: 'audio/mpeg', size: '2000' }],
  f2: [],
};

export async function mockGoogle(page, { failRefresh = false } = {}) {
  const state = { tokens: 0, driveCalls: [], authHeaders: [] };
  await page.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.google={accounts:{oauth2:{initTokenClient:(cfg)=>({requestAccessToken:(o)=>{
      window.__gisCalls=(window.__gisCalls||[]);window.__gisCalls.push(o&&o.prompt);
      if(window.__failRefresh && o.prompt==='none'){cfg.callback({error:'interaction_required'});return;}
      if(window.__failRefresh){cfg.error_callback({type:'popup_failed_to_open',message:'bloqué'});return;}
      window.__n=(window.__n||0)+1;
      cfg.callback({access_token:'tok'+window.__n,expires_in:window.__expires||3600});}}),revoke:()=>{}}}};`,
  }));
  await page.addInitScript((f) => { window.__failRefresh = f; }, failRefresh);
  await page.route('https://www.googleapis.com/drive/v3/files**', (route) => {
    const url = new URL(route.request().url());
    state.authHeaders.push(route.request().headers()['authorization']);
    if (url.searchParams.get('alt') === 'media') {
      return route.fulfill({ contentType: 'audio/mpeg', body: Buffer.alloc(5000, 1) });
    }
    const q = url.searchParams.get('q') || '';
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    state.driveCalls.push(parent);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ files: TREE[parent] || [] }) });
  });
  return state;
}
