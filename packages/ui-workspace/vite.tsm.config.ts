/**
 * Vite config for building as TSM plugin (Production)
 * Run: npx vite build --config vite.tsm.config.ts
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
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
        'storage-core',
        'storage-model',
        'primevue',
        'primeicons'
      ],
      output: {
        exports: 'named',
        // Rewrite imports to URLs for production
        paths: {
          'storage-core': '/plugins/@storage/core/index.js',
          'storage-model': '/plugins/@storage/model/index.js'
        }
      }
    }
  }
})
