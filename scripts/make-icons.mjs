// Génère les icônes PNG de l'app à partir d'un SVG (via Chromium de Playwright).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#3b5bdb"/>
<g fill="#fff"><path d="M330 120v190a62 62 0 1 1-34-55V170l-110 24v156a62 62 0 1 1-34-55V150z" transform="translate(30 10) scale(.92)"/></g></svg>`;

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch();
for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg(size)}</body>`);
  writeFileSync(`public/icons/${name}.png`, await page.screenshot());
  await page.close();
}
await browser.close();
