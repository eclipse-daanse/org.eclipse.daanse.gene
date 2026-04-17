#!/usr/bin/env node
/**
 * Prepare plugins for production deployment
 *
 * This script:
 * 1. Scans for built plugins (dist/tsm/index.js)
 * 2. Copies them to dist/plugins/
 * 3. Updates manifest entry paths to point to built files
 * 4. Generates the plugin index
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, cpSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const distDir = join(rootDir, 'dist')
const pluginsDistDir = join(distDir, 'plugins')

/**
 * Find all built plugins (those with dist/tsm/index.js)
 */
function findBuiltPlugins() {
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

    // Check if base dir itself has manifest and built files
    const manifestPath = join(baseDir, 'manifest.json')
    const builtPath = join(baseDir, 'dist/tsm/index.js')

    if (existsSync(manifestPath) && existsSync(builtPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        if (manifest.id) {
          plugins.push({
            id: manifest.id,
            path: baseDir,
            manifest,
            builtPath
          })
        }
      } catch (e) {
        console.warn(`Failed to parse ${manifestPath}:`, e.message)
      }
    }

    if (recursive) {
      // Scan subdirectories
      for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue

        const subManifestPath = join(baseDir, entry.name, 'manifest.json')
        const subBuiltPath = join(baseDir, entry.name, 'dist/tsm/index.js')

        if (existsSync(subManifestPath) && existsSync(subBuiltPath)) {
          try {
            const manifest = JSON.parse(readFileSync(subManifestPath, 'utf-8'))
            if (manifest.id) {
              plugins.push({
                id: manifest.id,
                path: join(baseDir, entry.name),
                manifest,
                builtPath: subBuiltPath
              })
            }
          } catch (e) {
            console.warn(`Failed to parse ${subManifestPath}:`, e.message)
          }
        }
      }
    }
  }

  return plugins
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function preparePlugin(plugin) {
  const { id, path: pluginPath, manifest, builtPath } = plugin
  const builtMapPath = builtPath + '.map'

  // Create plugin directory in dist
  const pluginDir = join(pluginsDistDir, id)
  ensureDir(pluginDir)

  // Update manifest entry to point to built file
  const updatedManifest = { ...manifest }
  updatedManifest.entry = 'index.js'

  // Write modified manifest
  writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify(updatedManifest, null, 2))

  // Copy built files
  copyFileSync(builtPath, join(pluginDir, 'index.js'))
  if (existsSync(builtMapPath)) {
    copyFileSync(builtMapPath, join(pluginDir, 'index.js.map'))
  }

  // Copy any additional assets (CSS, chunks, etc.)
  const distTsmDir = dirname(builtPath)
  for (const entry of readdirSync(distTsmDir, { withFileTypes: true })) {
    if (entry.name === 'index.js' || entry.name === 'index.js.map') continue
    const srcPath = join(distTsmDir, entry.name)
    const destPath = join(pluginDir, entry.name)

    if (entry.isDirectory()) {
      // Copy directory recursively (e.g., chunks folder)
      cpSync(srcPath, destPath, { recursive: true })
    } else {
      copyFileSync(srcPath, destPath)
    }
  }

  console.log(`✓ Prepared ${id}`)
  return id
}

function generateIndex(moduleIds) {
  const index = {
    name: 'Gene Plugins',
    description: 'Gene plugin repository',
    version: '1.0.0',
    modules: moduleIds
  }

  writeFileSync(join(pluginsDistDir, 'index.json'), JSON.stringify(index, null, 2))
  console.log(`✓ Generated index.json with ${moduleIds.length} plugins`)
}

/**
 * Find CSS files for plugins and add them to index.html
 */
function addPluginCssLinks() {
  const indexHtmlPath = join(distDir, 'index.html')
  if (!existsSync(indexHtmlPath)) {
    console.warn('index.html not found, skipping CSS injection')
    return
  }

  // Find all CSS files in plugins
  const cssFiles = []
  for (const entry of readdirSync(pluginsDistDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pluginDir = join(pluginsDistDir, entry.name)
    for (const file of readdirSync(pluginDir)) {
      if (file.endsWith('.css')) {
        cssFiles.push(`/plugins/${entry.name}/${file}`)
      }
    }
  }

  if (cssFiles.length === 0) {
    console.log('No plugin CSS files found')
    return
  }

  let html = readFileSync(indexHtmlPath, 'utf-8')

  // Generate CSS link tags
  const cssLinks = cssFiles.map(f => `    <link rel="stylesheet" href="${f}">`).join('\n')

  // Insert before </head>
  html = html.replace('</head>', `${cssLinks}\n  </head>`)

  writeFileSync(indexHtmlPath, html)
  console.log(`✓ Added ${cssFiles.length} plugin CSS links to index.html`)
}

/**
 * Update index.html with import map for all plugins
 */
function updateImportMap(moduleIds) {
  const indexHtmlPath = join(distDir, 'index.html')
  if (!existsSync(indexHtmlPath)) {
    console.warn('index.html not found, skipping import map update')
    return
  }

  let html = readFileSync(indexHtmlPath, 'utf-8')

  // Find existing import map
  const importMapMatch = html.match(/<script type="importmap">\s*(\{[\s\S]*?\})\s*<\/script>/)
  if (!importMapMatch) {
    console.warn('No import map found in index.html')
    return
  }

  try {
    const importMap = JSON.parse(importMapMatch[1])

    // Add plugin mappings
    for (const moduleId of moduleIds) {
      importMap.imports[moduleId] = `/plugins/${moduleId}/index.js`
    }


    // Replace import map in HTML
    const newImportMap = JSON.stringify(importMap, null, 2)
    html = html.replace(
      /<script type="importmap">[\s\S]*?<\/script>/,
      `<script type="importmap">\n${newImportMap}\n</script>`
    )

    writeFileSync(indexHtmlPath, html)
    console.log(`✓ Updated import map with ${moduleIds.length} plugin mappings`)
  } catch (e) {
    console.error('Failed to update import map:', e.message)
  }
}

// Main
console.log('Preparing plugins for production...\n')

ensureDir(pluginsDistDir)

const builtPlugins = findBuiltPlugins()

if (builtPlugins.length === 0) {
  console.error('✗ No built plugins found. Run "npm run plugins:build-all" first.')
  process.exit(1)
}

console.log(`Found ${builtPlugins.length} built plugins:\n`)

const preparedModules = builtPlugins
  .map(preparePlugin)
  .filter(Boolean)

if (preparedModules.length > 0) {
  generateIndex(preparedModules)
  updateImportMap(preparedModules)
  addPluginCssLinks()
  console.log(`\n✓ ${preparedModules.length} plugins ready in dist/plugins/`)
} else {
  console.error('\n✗ No plugins were prepared')
  process.exit(1)
}
