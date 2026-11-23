import { defineConfig, devices } from '@playwright/test';

// Chromium avec profil d'un iPhone (écran, tactile, user-agent). Ce n'est PAS un vrai Safari iOS :
// voir la checklist du README pour ce qui doit être vérifié sur le téléphone.
const { defaultBrowserType, ...iphone } = devices['iPhone 13'];

export default defineConfig({
  testDir: 'tests',
  use: { ...iphone, baseURL: 'http://localhost:4173', trace: 'off', launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } },
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60000 },
});
