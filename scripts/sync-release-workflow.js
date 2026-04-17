#!/usr/bin/env node
/**
 * Generiert die GitHub Actions Release-Workflow Datei
 * basierend auf den vorhandenen Plugins (manifest.json).
 *
 * Verwendung: node scripts/sync-release-workflow.js
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// Plugin-Kategorien für die Gruppierung im Workflow
const categories = {
  'Core':    ['gene-app', 'core'],
  'Storage': id => id.startsWith('storage-'),
  'UI':      id => id.startsWith('ui-') || id === 'instance-builder',
  'Feature': () => true  // Fallback für alles andere
}

// Plugins die standardmäßig aktiviert sein sollen
const defaultEnabled = new Set(
  JSON.parse(readFileSync(join(rootDir, 'release-plugins.json'), 'utf-8')).plugins
)

/**
 * Scannt alle Plugins mit manifest.json
 */
function findPlugins() {
  const plugins = []

  const scanDirs = [
    { base: 'packages/app', recursive: false },
    { base: 'packages/core', recursive: false },
    { base: 'packages/storage', recursive: true },
    { base: 'packages/ui', recursive: true },
    { base: 'packages/tsm-devtools', recursive: false },
    { base: 'packages/plugins', recursive: true },
    { base: 'plugins', recursive: true }
  ]

  for (const { base, recursive } of scanDirs) {
    const baseDir = join(rootDir, base)
    if (!existsSync(baseDir)) continue

    const manifestPath = join(baseDir, 'manifest.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        if (manifest.id) plugins.push(manifest.id)
      } catch {}
    }

    if (recursive) {
      for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const subManifest = join(baseDir, entry.name, 'manifest.json')
        if (existsSync(subManifest)) {
          try {
            const manifest = JSON.parse(readFileSync(subManifest, 'utf-8'))
            if (manifest.id) plugins.push(manifest.id)
          } catch {}
        }
      }
    }
  }

  return plugins
}

/**
 * Ordnet Plugins in Kategorien ein
 */
function categorize(plugins) {
  const result = new Map()
  for (const [cat] of Object.entries(categories)) result.set(cat, [])

  for (const id of plugins) {
    let placed = false
    for (const [cat, matcher] of Object.entries(categories)) {
      if (Array.isArray(matcher) ? matcher.includes(id) : matcher(id)) {
        result.get(cat).push(id)
        placed = true
        break
      }
    }
    if (!placed) result.get('Feature').push(id)
  }

  return result
}

/**
 * Generiert den Workflow YAML
 */
function generateWorkflow(categorized) {
  const allPlugins = [...categorized.values()].flat()

  // --- Input-Definitionen ---
  let inputs = ''
  inputs += `      create_release:\n`
  inputs += `        description: 'GitHub Release erstellen'\n`
  inputs += `        type: boolean\n`
  inputs += `        default: false\n`

  for (const [category, plugins] of categorized) {
    if (plugins.length === 0) continue
    inputs += `\n      # --- ${category} ---\n`
    for (const id of plugins) {
      const safeKey = id  // GitHub erlaubt Bindestriche in Input-Keys
      inputs += `      plugin_${safeKey}:\n`
      inputs += `        description: '${id}'\n`
      inputs += `        type: boolean\n`
      inputs += `        default: ${defaultEnabled.has(id)}\n`
    }
  }

  // --- add_if Zeilen ---
  const addIfLines = allPlugins
    .map(id => `            add_if "\${{ inputs.plugin_${id} }}" "${id}"`)
    .join('\n')

  return `# AUTO-GENERATED — Nicht manuell bearbeiten!
# Generiert durch: node scripts/sync-release-workflow.js

name: Release Build

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
${inputs}
permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx vue-tsc --noEmit

      - name: Resolve plugin list
        id: plugins
        run: |
          if [ "\${{ github.event_name }}" = "workflow_dispatch" ]; then
            PLUGINS=""
            add_if() { [ "\$1" = "true" ] && PLUGINS="\$PLUGINS,\$2"; }

${addIfLines}

            PLUGINS="\${PLUGINS#,}"
          else
            PLUGINS=\$(node -e "
              const cfg = JSON.parse(require('fs').readFileSync('release-plugins.json','utf-8'));
              console.log(cfg.plugins.join(','));
            ")
          fi

          echo "plugin_list=\$PLUGINS" >> "\$GITHUB_OUTPUT"
          echo "Plugins für Release: \$PLUGINS"

      - name: Build app
        run: npm run build-only

      - name: Build all plugins
        run: node scripts/build-plugins.js

      - name: Prepare plugins
        run: node scripts/prepare-plugins.js

      - name: Filter plugins
        run: |
          PLUGIN_LIST="\${{ steps.plugins.outputs.plugin_list }}"
          BUILT_PLUGINS=\$(ls dist/plugins/ | grep -v index.json)

          for plugin in \$BUILT_PLUGINS; do
            if ! echo ",\$PLUGIN_LIST," | grep -q ",\$plugin,"; then
              echo "- Entferne: \$plugin"
              rm -rf "dist/plugins/\$plugin"
            else
              echo "+ Behalte: \$plugin"
            fi
          done

          node -e "
            const fs = require('fs');
            const path = require('path');
            const pluginsDir = 'dist/plugins';
            const modules = fs.readdirSync(pluginsDir)
              .filter(f => f !== 'index.json' && fs.statSync(path.join(pluginsDir, f)).isDirectory());
            const index = { name: 'Gene Plugins', version: '1.0.0', modules };
            fs.writeFileSync(path.join(pluginsDir, 'index.json'), JSON.stringify(index, null, 2));
            console.log('Release enthält ' + modules.length + ' Plugins:', modules.join(', '));
          "

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: gene-release
          path: dist/
          retention-days: 30

      - name: Create release
        if: startsWith(github.ref, 'refs/tags/v') || inputs.create_release
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          cd dist && zip -r ../gene-release.zip . && cd ..

          TAG="\${GITHUB_REF_NAME:-manual-\$(date +%Y%m%d-%H%M%S)}"

          PLUGINS=\$(node -e "
            const idx = JSON.parse(require('fs').readFileSync('dist/plugins/index.json','utf-8'));
            idx.modules.forEach(m => console.log('- ' + m));
          ")

          gh release create "\$TAG" gene-release.zip \\
            --title "GenE \$TAG" \\
            --notes "\$(cat <<NOTES
          ## GenE Release \$TAG

          ### Enthaltene Plugins
          \$PLUGINS
          NOTES
          )" \\
            --latest
`
}

// --- Main ---
const plugins = findPlugins()
const categorized = categorize(plugins)

console.log('Gefundene Plugins:')
for (const [cat, ids] of categorized) {
  if (ids.length === 0) continue
  console.log(`  ${cat}: ${ids.join(', ')}`)
}

const workflow = generateWorkflow(categorized)
const outPath = join(rootDir, '.github/workflows/release.yml')
writeFileSync(outPath, workflow)

console.log(`\nWorkflow geschrieben: ${outPath}`)
console.log(`${plugins.length} Plugins, davon ${[...defaultEnabled].filter(p => plugins.includes(p)).length} standardmäßig aktiviert`)
