/**
 * Vite config for building as TSM plugin (Production)
 * Run: npx vite build --config vite.tsm.config.ts
 * Watch: npx vite build --config vite.tsm.config.ts --watch
 *
 * Shared modules (storage-core, etc.) are marked external and
 * import paths are rewritten to URLs. Browser caches shared modules.
 */
import { defineConfig } from 'vite'
import { resolve } from 'path'
import { getExternals, getOutputPaths } from '../tsm.shared'

export default defineConfig({
  build: {
    target: 'esnext',
    minify: false,
    sourcemap: true,
    outDir: 'dist/tsm',
    emptyDirOnBuild: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      // Shared modules are external - imported from shared URLs
      external: getExternals(),
      output: {
        exports: 'named',
        // Rewrite imports to URLs
        paths: getOutputPaths()
      }
    }
  }
})
