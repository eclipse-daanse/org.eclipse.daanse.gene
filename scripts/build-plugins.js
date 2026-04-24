#!/usr/bin/env node
/**
 * Build all TSM plugins for production
 *
 * This script:
 * 1. Scans packages/ for manifest.json files
 * 2. Builds each as a TSM plugin using Vite
 * 3. Uses tsmPlugin for tsm: import transformation
 * 4. Library providers (gene-app) bundle shared libs
 * 5. Other plugins externalize and use tsm: imports
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { tsmPlugin } from '@eclipse-daanse/tsm/vite'

/**
 * Plugin to fix Vue function ordering in bundle
 * Moves cloneVNode and related functions to the top to fix "not defined" errors
 */
function fixVueOrdering() {
  return {
    name: 'fix-vue-ordering',
    renderChunk(code) {
      // Find functions that need to be moved (cloneVNode and deepCloneVNode)
      const functionsToMove = []

      // Extract function by counting braces
      function extractFunction(code, fnName) {
        const startPattern = new RegExp(`function ${fnName}\\s*\\([^)]*\\)\\s*\\{`)
        const match = code.match(startPattern)
        if (!match) return null

        const startPos = code.indexOf(match[0])
        let braceCount = 1
        let pos = startPos + match[0].length

        while (braceCount > 0 && pos < code.length) {
          if (code[pos] === '{') braceCount++
          else if (code[pos] === '}') braceCount--
          pos++
        }

        return {
          text: code.slice(startPos, pos),
          start: startPos,
          end: pos
        }
      }

      // Extract cloneVNode
      const cloneVNode = extractFunction(code, 'cloneVNode')
      if (!cloneVNode) return null

      // Find first usage of cloneVNode
      const firstUsage = code.search(/[^a-zA-Z_]cloneVNode\s*\(/)

      // If function is defined after first usage, we need to move it
      if (cloneVNode.start <= firstUsage || firstUsage < 0) return null

      console.log(`    Moving cloneVNode from position ${cloneVNode.start} to top (first usage at ${firstUsage})`)

      // Also extract deepCloneVNode if it exists
      const deepCloneVNode = extractFunction(code, 'deepCloneVNode')

      // Remove functions from original positions (start with later one to preserve positions)
      let newCode = code
      if (deepCloneVNode && deepCloneVNode.start > cloneVNode.start) {
        newCode = newCode.slice(0, deepCloneVNode.start) + newCode.slice(deepCloneVNode.end)
      }
      newCode = newCode.slice(0, cloneVNode.start) + newCode.slice(cloneVNode.end)
      if (deepCloneVNode && deepCloneVNode.start < cloneVNode.start) {
        const adjustedStart = deepCloneVNode.start
        const adjustedEnd = deepCloneVNode.end
        newCode = newCode.slice(0, adjustedStart) + newCode.slice(adjustedEnd)
      }

      // Find insertion point (after imports)
      const lastImport = newCode.lastIndexOf("';")
      const insertPos = lastImport > 0 ? lastImport + 2 : 0

      // Build functions to insert (cloneVNode first, then deepCloneVNode if exists)
      let functionsCode = '\n// [fix-vue-ordering] Moved to fix function ordering\n' + cloneVNode.text + '\n'
      if (deepCloneVNode) {
        functionsCode += deepCloneVNode.text + '\n'
      }

      newCode = newCode.slice(0, insertPos) + functionsCode + newCode.slice(insertPos)

      return { code: newCode, map: null }
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// Library providers bundle shared dependencies
// Note: main.ts now registers shared libraries, so no plugins need to be library providers
const LIBRARY_PROVIDERS = []

// Packages to skip
const SKIP_PACKAGES = []

/**
 * Find all packages with manifest.json
 */
function findPlugins() {
  const plugins = []

  const scanDirs = [
    { base: 'packages', recursive: true },
    { base: 'plugins', recursive: true }
  ]

  for (const { base, recursive } of scanDirs) {
    const baseDir = join(rootDir, base)
    if (!existsSync(baseDir)) continue

    // Check if base dir itself has manifest
    const manifestPath = join(baseDir, 'manifest.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        if (manifest.id && !SKIP_PACKAGES.includes(manifest.id)) {
          plugins.push({
            id: manifest.id,
            path: baseDir,
            manifest
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
        if (existsSync(subManifestPath)) {
          try {
            const manifest = JSON.parse(readFileSync(subManifestPath, 'utf-8'))
            if (manifest.id && !SKIP_PACKAGES.includes(manifest.id)) {
              plugins.push({
                id: manifest.id,
                path: join(baseDir, entry.name),
                manifest
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

/**
 * Build a single plugin
 */
async function buildPlugin(plugin) {
  const { id, path: pluginPath, manifest } = plugin
  const entry = manifest.entry || 'src/index.ts'
  const entryPath = join(pluginPath, entry)

  if (!existsSync(entryPath)) {
    console.warn(`  Skipping ${id}: entry not found (${entry})`)
    return false
  }

  console.log(`  Building ${id}...`)

  const isLibraryProvider = LIBRARY_PROVIDERS.includes(id)

  // All plugin IDs that should be external (loaded via TSM at runtime)
  const pluginIds = [
    'gene-app', 'core', 'storage-model', 'storage-core', 'storage-git', 'storage-indexeddb', 'storage-model-atlas',
    'ui-file-explorer', 'instance-builder', 'ui-instance-tree', 'ui-layout',
    'ui-model-browser', 'ui-model-view', 'ui-perspectives', 'ui-problems-panel',
    'ui-properties-panel', 'ui-search', 'ui-workspace', 'ui-xmi-viewer',
    'tsm-devtools', 'metamodeler', 'transformation', 'cocl-editor', 'data-generator', 'dmn-editor', 'atlas-browser'
  ]

  // Custom external function
  // - Plugin IDs are always external (loaded via TSM)
  // - Library providers bundle vue/primevue/etc
  // - Other plugins externalize vue/primevue/etc
  const externalFn = (source) => {
    // TSM runtime always external
    if (source === '@eclipse-daanse/tsm' || source.startsWith('@eclipse-daanse/tsm/')) return true

    // Other plugins always external
    if (pluginIds.includes(source) && source !== id) return true

    // @gene/* packages always external
    if (source.startsWith('@gene/')) return true

    // Library providers bundle vue/primevue, others externalize
    if (!isLibraryProvider) {
      // Themes, CSS, config, and directives should be bundled, not externalized
      if (source.startsWith('@primevue/themes')) return false
      if (source.endsWith('.css')) return false
      if (source === 'primevue/config' || source === 'primevue/tooltip') return false

      const sharedPackages = ['vue', 'vue-router', 'primevue', '@primevue', 'primeicons', '@emfts']
      for (const pkg of sharedPackages) {
        if (source === pkg || source.startsWith(pkg + '/')) return true
      }
    }

    return false
  }

  // Alias config
  const aliasConfig = [
    // @ alias for src folder
    { find: '@', replacement: id === 'gene-app' ? join(rootDir, 'src') : join(pluginPath, 'src') },
    // Resolve @emfts/codec.jsonschema from root node_modules
    { find: '@emfts/codec.jsonschema', replacement: join(rootDir, 'node_modules/@emfts/codec.jsonschema/dist/index.js') },
    // Resolve @emfts/vue-registry from root node_modules
    { find: '@emfts/vue-registry', replacement: join(rootDir, 'node_modules/@emfts/vue-registry/dist/index.js') }
  ]

  try {
    // Library providers use multiple entries (one per library namespace)
    const buildConfig = {
      root: pluginPath,
      configFile: false,
      define: {
        'process.env.NODE_ENV': JSON.stringify('production')
      },
      plugins: [
        vue(),
        // Transform tsm: imports and bare shared module imports
        ...(isLibraryProvider ? [] : [tsmPlugin({
          useRenderChunk: true,
          sharedModules: ['vue', 'vue-router', 'primevue', '@emfts/core', '@emfts/vue-registry']
        })])
      ],
      build: {
        target: 'esnext',
        minify: false,
        sourcemap: true,
        outDir: 'dist/tsm',
        emptyDirBeforeBuild: true,
        rollupOptions: {
          external: (source) => {
            // tsm: imports are marked external by tsmPlugin, keep them
            if (source.startsWith('tsm:')) return true
            // Use TSM externals helper
            return externalFn(source)
          },
          output: {
            exports: 'named',
            hoistTransitiveImports: true
          }
        }
      },
      resolve: {
        alias: aliasConfig
      },
      logLevel: 'warn'
    }

    // All plugins use single entry with library mode
    buildConfig.build.lib = {
      entry: entryPath,
      formats: ['es'],
      fileName: () => 'index.js'
    }

    if (isLibraryProvider) {
      // Library providers bundle vue/primevue - no code splitting needed
      buildConfig.build.rollupOptions.output.inlineDynamicImports = true
    } else {
      // Regular plugins externalize shared libs (via tsm: imports)
      buildConfig.build.rollupOptions.output.inlineDynamicImports = true
    }

    await build(buildConfig)

    console.log(`  ✓ ${id} built successfully`)
    return true
  } catch (e) {
    console.error(`  ✗ ${id} failed:`, e.message)
    return false
  }
}


/**
 * Main
 */
async function main() {
  console.log('Building TSM plugins for production...\n')

  const plugins = findPlugins()
  console.log(`Found ${plugins.length} plugins:\n`)

  for (const p of plugins) {
    const isLib = LIBRARY_PROVIDERS.includes(p.id) ? ' [library provider]' : ''
    console.log(`  - ${p.id} (${p.path.replace(rootDir + '/', '')})${isLib}`)
  }
  console.log()

  let successCount = 0
  let failCount = 0

  for (const plugin of plugins) {
    const success = await buildPlugin(plugin)
    if (success) successCount++
    else failCount++
  }

  console.log(`\nBuild complete: ${successCount} succeeded, ${failCount} failed`)

  if (failCount > 0) {
    process.exit(1)
  }
}

main().catch(e => {
  console.error('Build failed:', e)
  process.exit(1)
})
