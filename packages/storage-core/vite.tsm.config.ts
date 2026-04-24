/**
 * Vite config for building storage-core as TSM plugin (Production)
 * Run: npx vite build --config vite.tsm.config.ts
 *
 * Bundles all dependencies including emfts and storage-model.
 */
import { defineConfig } from 'vite'
import { resolve } from 'path'

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
      output: {
        exports: 'named'
      }
    }
  }
})
