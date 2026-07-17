/**
 * Vite config for building as TSM plugin
 * Run: npm run build
 *
 * The CWM SVG assets are inlined at build time via import.meta.glob('...?raw'),
 * so the resulting plugin bundle is fully self-contained.
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
      // External dependencies - loaded from host
      external: [
        'vue',
        '@eclipse-daanse/tsm',
        'ui-instance-tree'
      ],
      output: {
        exports: 'named'
      }
    }
  }
})
