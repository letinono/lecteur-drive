// Styles disponibles. Pour en ajouter un : une entrée ici + un fichier src/styles/<nom>.css
// dont les règles commencent par html[data-theme="<nom>"].
import { store } from './store.js';

export const THEMES = { winamp: 'Winamp', apple: 'Apple Music' };
const DEFAULT = 'winamp';

export function getTheme() {
  const t = store.get('theme');
  return t in THEMES ? t : DEFAULT;
}

export function setTheme(name) {
  if (!(name in THEMES)) return;
  store.set('theme', name);
  document.documentElement.dataset.theme = name;
}
