/**
 * Vite config for building as TSM plugin
 * Run: npx vite build --config vite.tsm.config.ts
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
      // TSM types are external (loaded from host)
      external: ['@eclipse-daanse/tsm'],
      output: {
        exports: 'named'
      }
    }
  }
})
