#!/usr/bin/env npx tsx
/**
 * Build TSM Plugins for Production
 *
 * Scans packages/ for TSM modules (identified by manifest.json) and builds
 * each one using Vite. Generates dist/plugins/ with the production bundles.
 *
 * Features:
 * - Auto-discovers modules from manifest.json files
 * - Transforms tsm: imports to __tsm__.require() calls
 * - Bundles CSS and injects loader code
 * - Generates index.json with module list
 *
 * Usage:
 *   npx tsx scripts/build-plugins.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { tsmPlugin, generateCssLoader, createTsmExternals } from '@eclipse-daanse/tsm/vite'

// Paths
const rootDir = path.resolve(import.meta.dirname, '..')
const packagesDir = path.resolve(rootDir, 'packages')
const distDir = path.resolve(rootDir, 'dist')
const pluginsDistDir = path.resolve(distDir, 'plugins')

interface ModuleInfo {
  id: string
  folder: string
  manifest: Record<string, unknown>
}

/**
 * Recursively scan for TSM modules (folders with manifest.json containing an id)
 */
function scanModules(): ModuleInfo[] {
  const modules: ModuleInfo[] = []

  function scan(dir: string) {
    if (!fs.existsSync(dir)) return

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue

      const entryPath = path.join(dir, entry.name)
      const manifestPath = path.join(entryPath, 'manifest.json')

      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        if (manifest.id) {
          modules.push({ id: manifest.id, folder: entryPath, manifest })
        }
      } else {
        scan(entryPath) // Check subdirectories
      }
    }
  }

  scan(packagesDir)
  return modules
}

/**
 * Build a single TSM module
 */
async function buildModule(mod: ModuleInfo): Promise<boolean> {
  const moduleDistDir = path.join(pluginsDistDir, mod.id)
  fs.mkdirSync(moduleDistDir, { recursive: true })

  // Find entry point
  const entryFile = path.join(mod.folder, (mod.manifest.entry as string) || 'src/index.ts')
  if (!fs.existsSync(entryFile)) {
    console.warn(`  ⚠ Entry not found: ${entryFile}`)
    return false
  }

  // Determine output filename
  const outFileName = ((mod.manifest.entry as string) || 'src/index.ts')
    .replace(/\.ts$/, '.js')
    .replace(/\.vue$/, '.js')

  console.log(`Building ${mod.id}...`)

  try {
    await build({
      root: mod.folder,
      configFile: false,
      logLevel: 'warn',
      plugins: [
        vue(),
        tsmPlugin({ useRenderChunk: true })
      ],
      build: {
        lib: {
          entry: entryFile,
          formats: ['es'],
          fileName: () => outFileName.replace('src/', '')
        },
        outDir: moduleDistDir,
        emptyDirOnBuild: false,
        sourcemap: true,
        minify: false,
        cssCodeSplit: false,
        rollupOptions: {
          external: createTsmExternals(mod.id, {
            libraryProviders: ['gene-app'],
            sharedPackages: ['primevue', '@primevue', 'primeicons']
          }),
          output: {
            entryFileNames: outFileName,
            chunkFileNames: '[name].js',
            assetFileNames: '[name][extname]'
          }
        }
      },
      resolve: {
        alias: {
          '@': path.resolve(rootDir, 'src'),
          'storage-core': path.resolve(rootDir, 'packages/storage/core/src'),
          'storage-model': path.resolve(rootDir, 'packages/storage/model/src/generated/storage')
        }
      }
    })

    // Write manifest (update entry to .js)
    const updatedManifest = { ...mod.manifest }
    if (typeof updatedManifest.entry === 'string' && updatedManifest.entry.endsWith('.ts')) {
      updatedManifest.entry = updatedManifest.entry.replace('.ts', '.js')
    }
    fs.writeFileSync(
      path.join(moduleDistDir, 'manifest.json'),
      JSON.stringify(updatedManifest, null, 2)
    )

    // Inject CSS loader if CSS files were generated
    const jsFile = path.join(moduleDistDir, outFileName)
    const cssFiles = fs.readdirSync(moduleDistDir).filter(f => f.endsWith('.css'))

    if (cssFiles.length > 0 && fs.existsSync(jsFile)) {
      const jsContent = fs.readFileSync(jsFile, 'utf-8')
      const cssLoaders = cssFiles
        .map(cssFile => generateCssLoader(`/plugins/${mod.id}/${cssFile}`))
        .join('\n')
      fs.writeFileSync(jsFile, cssLoaders + '\n' + jsContent)
      console.log(`  ✓ CSS: ${cssFiles.join(', ')}`)
    }

    return true
  } catch (e) {
    console.error(`  ✗ Failed:`, e)
    return false
  }
}

/**
 * Main build process
 */
async function main() {
  console.log('Building TSM plugins for production...\n')

  // Clean and create output directory
  if (fs.existsSync(pluginsDistDir)) {
    fs.rmSync(pluginsDistDir, { recursive: true })
  }
  fs.mkdirSync(pluginsDistDir, { recursive: true })

  // Scan for modules
  const modules = scanModules()
  console.log(`Found ${modules.length} modules: ${modules.map(m => m.id).join(', ')}\n`)

  // Generate index.json
  const index = {
    name: 'Gene Plugins',
    description: 'Gene plugin repository',
    version: '1.0.0',
    modules: modules.map(m => m.id)
  }
  fs.writeFileSync(path.join(pluginsDistDir, 'index.json'), JSON.stringify(index, null, 2))

  // Build each module
  let success = 0
  let failed = 0

  for (const mod of modules) {
    const ok = await buildModule(mod)
    if (ok) success++
    else failed++
  }

  console.log(`\n✓ Done: ${success} succeeded, ${failed} failed`)
}

main().catch(console.error)
