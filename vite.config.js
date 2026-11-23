import { defineConfig } from 'vite';
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Génère dist/sw.js : liste des fichiers de l'INTERFACE uniquement (jamais de MP3 ni d'appel Google).
function listFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

function serviceWorkerPlugin() {
  let outDir = 'dist';
  return {
    name: 'generate-sw',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files = listFiles(outDir)
        .map((p) => relative(outDir, p).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const hash = createHash('sha1');
      files.forEach((f) => hash.update(f).update(readFileSync(join(outDir, f))));
      const template = readFileSync('src/sw-template.js', 'utf8');
      const out = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 10))
        .replace('__FILES__', JSON.stringify(['./', ...files]));
      writeFileSync(join(outDir, 'sw.js'), out);
    },
  };
}

// base './' : fonctionne sous https://utilisateur.github.io/nom-du-depot/
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') },
  plugins: [serviceWorkerPlugin()],
  build: { target: 'es2020' },
});
