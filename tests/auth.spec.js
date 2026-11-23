import { test, expect } from '@playwright/test';
import { login, mockGoogle } from './helpers.js';

test('le renouvellement silencieux remplace le jeton', async ({ page }) => {
  await mockGoogle(page);
  await login(page);
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('button', { name: 'Tester le renouvellement' }).click();
  await expect(page.getByRole('status')).toContainText('réussi');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ld.token')).access_token)).toBe('tok2');
});

test('jeton proche de l\'expiration : renouvelé tout seul, sans interrompre', async ({ page }) => {
  await mockGoogle(page);
  await page.addInitScript(() => { window.__expires = 306; }); // expire dans 5 min 6 s -> renouvellement à ~6 s
  await login(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ld.token')).access_token), { timeout: 20000 }).toBe('tok2');
});

test('jeton expiré au démarrage et renouvellement refusé : écran de connexion', async ({ page }) => {
  await mockGoogle(page, { failRefresh: true });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('ld.token', JSON.stringify({ access_token: 'old', expires_at: Date.now() - 1000 })));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
});

test('échec de renouvellement en cours de lecture : bandeau « Reconnecter », la piste continue', async ({ page }) => {
  await mockGoogle(page);
  await page.addInitScript(() => { window.__expires = 1; }); // jeton de 1 s : renouvelé (et refusé) après ~5 s
  await login(page);
  await page.locator('[data-track]').first().click();
  await expect.poll(() => page.evaluate(() => !document.querySelector('audio').paused)).toBe(true);
  await page.evaluate(() => { window.__failRefresh = true; });
  await expect(page.locator('#banner')).toContainText('Session Google expirée', { timeout: 15000 });
  expect(await page.evaluate(() => document.querySelector('audio').currentTime)).toBeGreaterThan(0);
  await page.evaluate(() => { window.__failRefresh = false; });
  await page.locator('#banner').getByRole('button', { name: 'Reconnecter' }).click();
  await expect(page.locator('#banner')).toBeEmpty();
});

test('retour de redirection OAuth : jeton lu dans l\'URL puis effacé', async ({ page }) => {
  await mockGoogle(page);
  await page.addInitScript(() => { if (!localStorage.getItem('ld.oauthState')) localStorage.setItem('ld.oauthState', 'abc'); });
  await page.goto('/#access_token=redir1&expires_in=3600&state=abc&token_type=Bearer');
  await expect(page.locator('.list li').first()).toBeVisible();
  expect(page.url()).not.toContain('access_token');
});

test('service worker : interface seule en cache, rien de Google ni d\'audio', async ({ page }) => {
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

test('mise en page mobile : pas de défilement horizontal (liste et lecteur)', async ({ page }) => {
  await mockGoogle(page);
  await login(page);
  const over = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(await over()).toBe(false);
  await page.locator('[data-track]').first().click();
  await page.locator('#mini .info').click();
  await expect(page.locator('#sheet')).toBeVisible();
  expect(await over()).toBe(false);
});
