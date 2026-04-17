/**
 * Vite plugin to generate import maps for TSM plugins
 *
 * In dev mode: Maps bare specifiers to source files (Vite transforms them)
 * In production: Maps to built module chunks (using actual generated filenames)
 */

import type { Plugin, ResolvedConfig } from 'vite'
import * as fs from 'fs'
import * as path from 'path'

export interface ImportMapEntry {
  name: string
  devPath: string
}

const sharedModules: ImportMapEntry[] = [
  { name: 'gene-core', devPath: '/packages/core/src/index.ts' },
  { name: 'storage-core', devPath: '/packages/storage/core/src/index.ts' },
  { name: 'storage-model', devPath: '/packages/storage/model/src/generated/storage/index.ts' },
  { name: '@emfts/core', devPath: '/node_modules/@emfts/core/dist/index.js' },
  { name: '@eclipse-daanse/tsm', devPath: '/node_modules/@eclipse-daanse/tsm/dist/index.js' },
  { name: 'vue', devPath: '/node_modules/vue/dist/vue.esm-bundler.js' },
  { name: 'vue-router', devPath: '/node_modules/vue-router/dist/vue-router.esm-bundler.js' },
  { name: '@emfts/vue-registry', devPath: '/node_modules/@emfts/vue-registry/dist/index.js' },
]

export function importMapPlugin(): Plugin {
  let config: ResolvedConfig
  let isDev = true
  const generatedFiles: Map<string, string> = new Map()

  return {
    name: 'import-map-generator',

    configResolved(resolvedConfig) {
      config = resolvedConfig
      isDev = resolvedConfig.command === 'serve'
    },

    // Capture generated bundle info
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk') {
          // Map module names to their generated file names
          for (const mod of sharedModules) {
            // Try different naming patterns
            const patterns = [
              `__federation_shared_${mod.name}-`,
              `__federation_shared_${mod.name.replace('@', '').replace('/', '-')}-`,
              `__federation_shared_${mod.name.replace(/[@/]/g, '')}-`
            ]
            for (const pattern of patterns) {
              if (fileName.includes(pattern)) {
                // fileName already has full path from assets dir
                generatedFiles.set(mod.name, `/${fileName}`)
                break
              }
            }
          }
        }
      }
    },

    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const imports: Record<string, string> = {}

        for (const mod of sharedModules) {
          if (isDev) {
            imports[mod.name] = mod.devPath
          } else {
            // Use actual generated filename or fallback
            const generatedPath = generatedFiles.get(mod.name)
            if (generatedPath) {
              imports[mod.name] = generatedPath
            } else {
              // Fallback: try to find the file in dist/assets
              const assetsDir = path.resolve(config.root, 'dist/assets')
              if (fs.existsSync(assetsDir)) {
                const files = fs.readdirSync(assetsDir)
                const patterns = [
                  `__federation_shared_${mod.name}-`,
                  `__federation_shared_${mod.name.replace('@', '').replace('/', '-')}-`,
                  `__federation_shared_${mod.name.replace(/[@/]/g, '')}-`
                ]
                for (const pattern of patterns) {
                  const match = files.find(f => f.includes(pattern))
                  if (match) {
                    imports[mod.name] = `/assets/${match}`
                    break
                  }
                }
              }
            }
          }
        }

        const importMap = { imports }
        const importMapScript = `<script type="importmap">
${JSON.stringify(importMap, null, 2)}
</script>`

        return html.replace('<script', `${importMapScript}\n    <script`)
      }
    }
  }
}
