import { test, expect } from '@playwright/test';
import { mockGoogle } from './helpers.js';

test('connexion, navigation triée, dossier racine mémorisé, jeton envoyé', async ({ page }) => {
  const g = await mockGoogle(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  const items = page.locator('.list li');
  await expect(items).toHaveCount(4);
  // dossiers d'abord (A avant B), puis pistes en tri naturel (2 avant 10)
  await expect(items.nth(0)).toContainText('Album A');
  await expect(items.nth(1)).toContainText('Album B');
  await expect(items.nth(2)).toContainText('2 - deux.mp3');
  await expect(items.nth(3)).toContainText('10 - dix.mp3');
  expect(g.authHeaders[0]).toBe('Bearer tok1');

  await items.nth(1).click();
  await expect(page.locator('.list li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Choisir comme racine' }).click();
  await page.reload();
  // reconnecté grâce au jeton stocké, et ouvert directement sur le dossier racine mémorisé
  await expect(page.locator('.list li')).toHaveCount(1);
  await expect(page.locator('.diag')).toContainText('Album B');
});

test('le renouvellement silencieux remplace le jeton', async ({ page }) => {
  await mockGoogle(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  await expect(page.locator('.list li').first()).toBeVisible();
  await page.getByRole('button', { name: 'Tester le renouvellement' }).click();
  await expect(page.getByRole('status')).toContainText('réussi');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ld.token')).access_token)).toBe('tok2');
});

test('échec du renouvellement : message clair, pas de plantage', async ({ page }) => {
  await mockGoogle(page, { failRefresh: true });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('ld.token', JSON.stringify({ access_token: 'old', expires_at: Date.now() + 120000 })));
  await page.reload();
  await page.getByRole('button', { name: 'Tester le renouvellement' }).click();
  await expect(page.getByRole('status')).toContainText('Échec');
});

test('téléchargement en blob d\'une piste', async ({ page }) => {
  const g = await mockGoogle(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  await page.locator('[data-track="t2"]').click();
  await expect(page.getByRole('status')).toContainText(/Lecture en cours|Erreur lecture/);
  expect(g.authHeaders.length).toBeGreaterThan(1);
});

test('retour de redirection OAuth : jeton lu dans l\'URL puis effacé', async ({ page }) => {
  await mockGoogle(page);
  await page.addInitScript(() => { if (!localStorage.getItem('ld.oauthState')) localStorage.setItem('ld.oauthState', 'abc'); });
  await page.goto('/#access_token=redir1&expires_in=3600&state=abc&token_type=Bearer');
  await expect(page.locator('.list li').first()).toBeVisible();
  expect(page.url()).not.toContain('access_token');
});

test('service worker : interface seule en cache, rien de Google', async ({ page }) => {
  await mockGoogle(page);
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
  const keys = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = (await (await caches.open(names[0])).keys()).map((r) => r.url);
    return { names, urls };
  });
  expect(keys.names).toHaveLength(1);
  expect(keys.urls.some((u) => u.includes('googleapis') || u.endsWith('.mp3'))).toBe(false);
  expect(keys.urls.length).toBeGreaterThan(3);
});

test('mise en page mobile : pas de défilement horizontal', async ({ page }) => {
  await mockGoogle(page);
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
