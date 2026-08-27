#!/usr/bin/env node
/**
 * Baut den Wizard als TSM-Plugin-Bundle und erzeugt ein statisch servebares
 * Plugin-Repository (T12/#141):
 *
 *   dist/plugins/
 *   ├── index.json                          ← Repository-Index für die Discovery
 *   └── sensinact-mapping-wizard/
 *       ├── manifest.json                   ← entry zeigt auf index.js
 *       └── index.js                        ← ES-Modul, Shared Libs external,
 *                                             CSS zur Laufzeit injiziert
 *
 * Muster nach gene/scripts/build-plugins.js; Shared Libs stellt der gene-Host
 * über die TSM-Runtime bereit (tsmPlugin schreibt sie auf __tsm__.require um).
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { tsmPlugin } from '@eclipse-daanse/tsm/vite';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(rootDir, 'manifest.json'), 'utf-8'));
const pluginId = manifest.id;

/** Vom gene-Host bereitgestellte Shared Libraries (extern, via TSM-Runtime). */
const SHARED_MODULES = [
  'vue',
  'vue-router',
  'primevue',
  '@emfts/core',
  '@emfts/vue-registry',
  '@emfts/uimodel-composer',
  '@eclipse-daanse/tsm',
];

/** gene-Module: nie bundeln — zur Laufzeit über TSM (context.getModule). */
const GENE_MODULES = ['storage-model-atlas', 'storage-core', 'storage-model', 'ui-model-browser', 'ui-search', 'ui-layout', 'gene-app'];

function isExternal(source) {
  if (source.startsWith('tsm:')) return true;
  for (const pkg of [...SHARED_MODULES, ...GENE_MODULES]) {
    if (source === pkg || source.startsWith(pkg + '/')) return true;
  }
  if (source === 'primeicons' || source.startsWith('primeicons/')) return true;
  return false;
}

/** Injiziert das von Vite extrahierte CSS zur Laufzeit als <style>-Element. */
function inlineCssPlugin() {
  return {
    name: 'inline-css-into-js',
    // Nach vite:css-post laufen — erst dann existiert das CSS-Asset im Bundle
    enforce: 'post',
    generateBundle(_options, bundle) {
      let css = '';
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (fileName.endsWith('.css') && asset.type === 'asset') {
          css += String(asset.source);
          delete bundle[fileName];
        }
      }
      if (!css) return;
      const entry = Object.values(bundle).find((c) => c.type === 'chunk' && c.isEntry);
      if (!entry) return;
      const inject =
        `\n(function(){if(typeof document==='undefined')return;` +
        `var s=document.createElement('style');` +
        `s.setAttribute('data-tsm-module',${JSON.stringify(pluginId)});` +
        `s.textContent=${JSON.stringify(css)};` +
        `document.head.appendChild(s);})();\n`;
      entry.code += inject;
    },
  };
}

console.log(`Baue TSM-Plugin ${pluginId} …`);

await build({
  root: rootDir,
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [
    vue(),
    tsmPlugin({ useRenderChunk: true, sharedModules: SHARED_MODULES }),
    inlineCssPlugin(),
  ],
  build: {
    target: 'esnext',
    minify: false,
    sourcemap: true,
    outDir: 'dist/tsm',
    emptyOutDir: true,
    lib: {
      entry: join(rootDir, manifest.entry),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: isExternal,
      output: { exports: 'named', inlineDynamicImports: true },
    },
  },
  logLevel: 'warn',
});

// Repository-Layout erzeugen
const repoDir = join(rootDir, 'dist', 'plugins');
const moduleDir = join(repoDir, pluginId);
rmSync(repoDir, { recursive: true, force: true });
mkdirSync(moduleDir, { recursive: true });

cpSync(join(rootDir, 'dist', 'tsm', 'index.js'), join(moduleDir, 'index.js'));
try {
  cpSync(join(rootDir, 'dist', 'tsm', 'index.js.map'), join(moduleDir, 'index.js.map'));
} catch {
  /* sourcemap optional */
}
writeFileSync(
  join(moduleDir, 'manifest.json'),
  JSON.stringify({ ...manifest, entry: 'index.js' }, null, 2),
);
writeFileSync(
  join(repoDir, 'index.json'),
  JSON.stringify(
    {
      name: 'SensiNact Mapping Wizard Repository',
      description: 'TSM-Plugin-Repository des SensiNact-Mapping-Assistenten',
      version: manifest.version,
      modules: [pluginId],
    },
    null,
    2,
  ),
);

// Externals-Check: Shared Libs dürfen nicht im Bundle stecken
const bundleCode = readFileSync(join(moduleDir, 'index.js'), 'utf-8');
const leaks = [];
if (/\bcreateElementBlock\b[\s\S]*?\bdefineComponent\s*=/.test(bundleCode)) leaks.push('vue (gebündelt?)');
for (const marker of ['@emfts/core/dist', 'BasicEPackage.js']) {
  if (bundleCode.includes(marker)) leaks.push(marker);
}
if (leaks.length) {
  console.error(`✗ Externals-Check fehlgeschlagen: ${leaks.join(', ')}`);
  process.exit(1);
}
const requires = [...bundleCode.matchAll(/__tsm__\.require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
// Cache-Control für den Entwicklungs-Server: Ohne no-store liefert der
// Browser nach einem Rebuild weiter das alte Modul aus dem Cache
// (dynamische Imports des TSM-Loaders), und Änderungen scheinen zu fehlen.
writeFileSync(
  join(repoDir, 'serve.json'),
  JSON.stringify(
    { headers: [{ source: '**', headers: [{ key: 'Cache-Control', value: 'no-store' }] }] },
    null,
    2,
  ) + '\n',
);

console.log(`✓ ${pluginId} gebaut → dist/plugins/ (${(bundleCode.length / 1024).toFixed(0)} kB)`);
console.log(`  Shared-Imports via TSM: ${[...new Set(requires)].join(', ') || '(keine)'}`);
