import { test, expect } from '@playwright/test';
import { login, mockGoogle } from './helpers.js';

const title = (page) => page.locator('#mini .t b');
const audioState = (page) => page.evaluate(() => { const a = document.querySelector('audio'); return { paused: a.paused, t: a.currentTime, src: a.src.slice(0, 5), d: a.duration }; });

test('connexion : racine « Musique » retrouvée par son nom, tri naturel, pas de dossier parent', async ({ page }) => {
  const g = await mockGoogle(page);
  await login(page);
  expect(g.findCalls).toBe(1);
  await expect(page.locator('h1')).toHaveText('Musique');
  const items = page.locator('.list li');
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText('Album A');
  await expect(items.nth(1)).toContainText('Album B');
  await expect(items.nth(2)).toContainText('2 - deux');
  await expect(items.nth(3)).toContainText('10 - dix');
  await expect(page.getByRole('button', { name: /parent/i })).toHaveCount(0);
  expect(g.authHeaders[0]).toBe('Bearer tok1');
  // le jeton est envoyé en en-tête, jamais dans l'URL
  expect(g.listCalls).not.toContain('root');
});

test('dossier « Musique » absent : message clair', async ({ page }) => {
  await mockGoogle(page, { noRoot: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  await expect(page.locator('#view').getByRole('status')).toContainText('introuvable');
});

test('navigation dans un sous-dossier, fil d\'Ariane, retour, chemin mémorisé', async ({ page }) => {
  await mockGoogle(page);
  await login(page);
  await page.locator('[data-folder]').nth(1).click(); // Album B
  await expect(page.locator('.crumbs')).toContainText('Album B');
  await expect(page.locator('.list li').first()).toContainText('01 Première');
  await page.reload();
  await expect(page.locator('.crumbs')).toContainText('Album B'); // rouvert au même endroit
  await page.getByRole('button', { name: /parent/i }).click();
  await expect(page.locator('.list li')).toHaveCount(4);
});

test('lecture : blob, tags ID3, pochette, Media Session, préchargement', async ({ page }) => {
  const g = await mockGoogle(page);
  await login(page);
  await page.locator('[data-folder]').nth(1).click();
  await page.locator('[data-track]').first().click(); // « 01 Première » (tags)
  await expect(title(page)).toHaveText('Première (tag)');
  await expect(page.locator('#mini .cover')).toHaveAttribute('src', /^blob:/);
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  expect((await audioState(page)).src).toBe('blob:');
  const md = await page.evaluate(() => ({ t: navigator.mediaSession.metadata.title, a: navigator.mediaSession.metadata.artist, al: navigator.mediaSession.metadata.album, art: navigator.mediaSession.metadata.artwork[0].src.slice(0, 5) }));
  expect(md).toEqual({ t: 'Première (tag)', a: 'Artiste Test', al: 'Album Test', art: 'blob:' });
  // la piste suivante est téléchargée pendant la lecture
  await expect.poll(() => g.media).toContain('b2');
});

test('Media Session : commandes écran verrouillé enregistrées et fonctionnelles', async ({ page }) => {
  await mockGoogle(page);
  await login(page);
  await page.locator('[data-folder]').nth(1).click();
  await page.locator('[data-track]').first().click();
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  const handlers = await page.evaluate(() => Object.keys(window.__ms).sort());
  expect(handlers).toEqual(expect.arrayContaining(['nexttrack', 'pause', 'play', 'previoustrack', 'seekto']));
  await page.evaluate(() => window.__ms.pause());
  await expect.poll(async () => (await audioState(page)).paused).toBe(true);
  await page.evaluate(() => window.__ms.play());
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  await page.evaluate(() => window.__ms.nexttrack());
  await expect(title(page)).toHaveText('02 Seconde');
  await page.evaluate(() => window.__ms.previoustrack());
  await expect(title(page)).toHaveText('Première (tag)');
});

test('enchaînement automatique à la fin d\'une piste', async ({ page }) => {
  await mockGoogle(page);
  await login(page);
  await page.locator('[data-folder]').nth(1).click();
  await page.locator('[data-track]').first().click();
  await expect(title(page)).toHaveText('02 Seconde', { timeout: 10000 });
});

test('lecteur plein écran : file d\'attente, répétition, aléatoire, saut', async ({ page }) => {
  await mockGoogle(page);
  await login(page);
  await page.getByRole('button', { name: /lire le dossier/i }).click(); // récursif : 2 + 2 + 1 pistes... ordre : pistes du dossier puis sous-dossiers
  await expect(title(page)).toHaveText('2 - deux');
  await page.locator('#mini .info').click();
  const queue = page.locator('#sheet .list li');
  await expect(queue).toHaveCount(5);
  await expect(queue.nth(0)).toContainText('2 - deux');
  await expect(queue.nth(1)).toContainText('10 - dix');
  // sous-dossiers par nom : Album A (a1) puis Album B (01, 02)
  await expect(queue.nth(2)).toContainText('a1');
  await expect(queue.nth(3)).toContainText('01 Première');
  await expect(queue.nth(4)).toContainText('02 Seconde');

  await queue.nth(4).locator('button').click();
  await expect(page.locator('#sheet .title')).toHaveText('02 Seconde');

  // répétition : off -> all -> one -> off
  const rep = page.locator('#sheet [data-pl="repeat"]');
  await rep.click(); await expect(rep).toHaveAttribute('aria-label', /tout/);
  await rep.click(); await expect(rep).toHaveAttribute('aria-label', /une piste/);
  await rep.click(); await expect(rep).toHaveAttribute('aria-label', /désactivée/);
  await rep.click(); // all : le suivant de la dernière piste reboucle
  await page.locator('#sheet [data-pl="next"]:visible').click(); // dernière piste -> reboucle
  await expect(page.locator('#sheet .title')).toHaveText('2 - deux');
  await queue.nth(4).locator('button').click();
  await page.locator('#sheet [data-pl="next"]:visible').click();
  await expect(page.locator('#sheet .title')).toHaveText('2 - deux');

  // aléatoire : la piste courante reste en tête de file, mêmes pistes
  await page.locator('#sheet [data-pl="shuffle"]').click();
  const names = await page.locator('#sheet .list li .name').allTextContents();
  expect(names[0]).toBe('2 - deux');
  expect([...names].sort()).toEqual(['01 Première', '02 Seconde', '10 - dix', '2 - deux', 'a1'].sort());
});

test('barre de progression : déplacement dans la piste', async ({ page }) => {
  await mockGoogle(page);
  await login(page);
  await page.locator('[data-track]').first().click();
  await expect.poll(async () => (await audioState(page)).d).toBeGreaterThan(1);
  await page.locator('#mini .info').click();
  await page.locator('#seek').fill('500');
  await page.locator('#seek').dispatchEvent('change');
  await expect.poll(async () => (await audioState(page)).t).toBeGreaterThan(0.4);
});

test('reprise de la dernière piste et de la position à la réouverture', async ({ page }) => {
  await mockGoogle(page);
  await login(page);
  await page.locator('[data-track]').nth(1).click(); // « 10 - dix »
  await expect(title(page)).toHaveText('10 - dix');
  await page.locator('#mini .info').click();
  await expect.poll(async () => (await audioState(page)).d).toBeGreaterThan(1);
  await page.locator('#seek').fill('500');
  await page.locator('#seek').dispatchEvent('change');
  await page.evaluate(() => window.__ms.pause());
  await page.reload();
  await expect(title(page)).toHaveText('10 - dix');
  expect((await audioState(page)).paused).toBe(true);
  await page.locator('#mini [data-pl="toggle"]').click();
  await expect.poll(async () => (await audioState(page)).t, { timeout: 8000 }).toBeGreaterThan(0.4);
});

test('mémoire : les anciennes pistes sont libérées', async ({ page }) => {
  await mockGoogle(page);
  await login(page);
  await page.getByRole('button', { name: /lire le dossier/i }).click();
  await expect(title(page)).toHaveText('2 - deux');
  for (let i = 0; i < 4; i++) await page.locator('#mini [data-pl="next"]').click();
  await expect(title(page)).toHaveText('02 Seconde');
  await expect.poll(() => page.evaluate(() => window.__revoked)).toBeGreaterThan(0);
});

test('menu des styles : Winamp par défaut, Apple Music au choix, choix mémorisé', async ({ page }) => {
  await mockGoogle(page);
  await login(page);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  expect(await theme()).toBe('winamp');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('button', { name: 'Apple Music' }).click();
  expect(await theme()).toBe('apple');
  await page.reload();
  expect(await theme()).toBe('apple'); // mémorisé
  // le lecteur fonctionne dans ce style : un seul bouton lecture/pause visible, les commandes Winamp sont masquées
  await page.locator('[data-track]').first().click();
  await page.locator('#mini .info').click();
  await expect(page.locator('#sheet [data-pl="toggle"]:visible')).toBeVisible();
  await expect(page.locator('#sheet [data-pl="stop"]')).toBeHidden();
  await page.locator('#sheet [data-pl="toggle"]:visible').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('audio').paused)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.locator('#sheet [data-pl="close"]').click();
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('button', { name: 'Winamp' }).click();
  expect(await theme()).toBe('winamp');
});
