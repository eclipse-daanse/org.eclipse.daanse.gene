import { fileURLToPath, URL } from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { importMapPlugin } from './src/vite/importmap-plugin'
import { tsmPlugin } from '@eclipse-daanse/tsm/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Scan for TSM modules and build moduleId -> folder mapping
 */
interface TsmModule {
  folder: string
  entry: string
}

function scanTsmModules(): Map<string, TsmModule> {
  const modules = new Map<string, TsmModule>()

  // Directories to scan for manifest.json
  const scanDirs = [
    { dir: 'packages', recursive: true },
    { dir: 'plugins', recursive: false }
  ]

  function scanDirectory(baseDir: string, recursive: boolean) {
    const fullPath = path.resolve(__dirname, baseDir)
    if (!fs.existsSync(fullPath)) return

    for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue

      const entryPath = path.join(fullPath, entry.name)
      const manifestPath = path.join(entryPath, 'manifest.json')

      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
          if (manifest.id) {
            modules.set(manifest.id, {
              folder: entryPath,
              entry: manifest.entry || 'src/index.ts'
            })
          }
        } catch (e) {
          console.warn(`Failed to parse ${manifestPath}:`, e)
        }
      } else if (recursive) {
        // Scan subdirectories for nested manifest.json
        scanDirectory(path.join(baseDir, entry.name), false)
      }
    }
  }

  for (const { dir, recursive } of scanDirs) {
    scanDirectory(dir, recursive)
  }

  return modules
}

// Build module map at startup
const tsmModules = scanTsmModules()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    importMapPlugin(),
    tsmPlugin({ useRenderChunk: false }),
    // Serve TSM plugins from discovered modules
    {
      name: 'serve-tsm-plugins',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/plugins')) {
            return next()
          }

          const urlPath = req.url.split('?')[0]

          // Serve plugin index
          if (urlPath === '/plugins' || urlPath === '/plugins/' || urlPath === '/plugins/index.json') {
            const index = {
              name: 'Gene Plugins',
              description: 'Gene plugin repository',
              version: '1.0.0',
              modules: Array.from(tsmModules.keys())
            }

            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(JSON.stringify(index, null, 2))
            return
          }

          // Extract moduleId from URL: /plugins/{moduleId}/...
          const match = urlPath.match(/^\/plugins\/([^/]+)(.*)$/)
          if (!match) {
            res.statusCode = 404
            res.end('Not Found')
            return
          }

          const moduleId = match[1]
          let subPath = match[2] || ''
          if (subPath.startsWith('/')) subPath = subPath.slice(1)

          // Look up module folder
          const moduleInfo = tsmModules.get(moduleId)
          if (!moduleInfo) {
            res.statusCode = 404
            res.end(`Module not found: ${moduleId}`)
            return
          }

          const moduleFolder = moduleInfo.folder

          // Default to manifest.json if no subpath
          if (!subPath) {
            subPath = 'manifest.json'
          }

          const requestedPath = path.join(moduleFolder, subPath)

          // Security check
          if (!requestedPath.startsWith(moduleFolder)) {
            res.statusCode = 403
            res.end('Forbidden')
            return
          }

          if (!fs.existsSync(requestedPath)) {
            res.statusCode = 404
            res.end(`Not Found: ${subPath}`)
            return
          }

          const stats = fs.statSync(requestedPath)
          let filePath = requestedPath

          if (stats.isDirectory()) {
            const indexPath = path.join(requestedPath, 'index.json')
            const manifestPath = path.join(requestedPath, 'manifest.json')

            if (fs.existsSync(indexPath)) {
              filePath = indexPath
            } else if (fs.existsSync(manifestPath)) {
              filePath = manifestPath
            } else {
              res.statusCode = 404
              res.end('Not Found')
              return
            }
          }

          const ext = path.extname(filePath).toLowerCase()

          // For TypeScript/Vue files, let Vite handle transformation
          if (ext === '.ts' || ext === '.tsx' || ext === '.vue') {
            const relativePath = path.relative(__dirname, filePath)
            req.url = '/' + relativePath.replace(/\\/g, '/')
            return next()
          }

          // Serve other files directly
          const contentTypes: Record<string, string> = {
            '.json': 'application/json',
            '.js': 'application/javascript',
            '.mjs': 'application/javascript'
          }

          const content = fs.readFileSync(filePath, 'utf-8')
          res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(content)
        })
      }
    },
  ],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Generate aliases from discovered modules
      ...Array.from(tsmModules.entries()).map(([moduleId, { folder, entry }]) => ({
        find: moduleId,
        replacement: fileURLToPath(new URL(path.join(path.relative(__dirname, folder), entry), import.meta.url))
      })),
      // Remote modules - types only for IDE
      { find: 'core', replacement: fileURLToPath(new URL('./.tsm/types/core/index.d.ts', import.meta.url)) },
      // Direct module aliases (without manifest.json)
      { find: 'ui-problems-panel', replacement: fileURLToPath(new URL('./packages/ui-problems-panel/src/index.ts', import.meta.url)) },
      { find: 'ui-search', replacement: fileURLToPath(new URL('./packages/ui-search/src/index.ts', import.meta.url)) },
    ],
  },
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/rest': {
        target: 'http://localhost:8185',
        changeOrigin: true,
      }
    }
  }
})
