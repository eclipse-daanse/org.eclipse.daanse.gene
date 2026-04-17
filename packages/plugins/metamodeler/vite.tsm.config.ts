/**
 * Vite config for building as TSM plugin
 * Run: npm run build
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
        '@emfts/core',
        'primevue',
        'primevue/tree',
        'primevue/button',
        'primevue/inputtext',
        'primevue/dropdown',
        'primevue/checkbox',
        'primevue/contextmenu',
        'primevue/dialog',
        'primevue/message',
        'primevue/textarea',
        'primeicons'
      ],
      output: {
        exports: 'named'
      }
    }
  }
})
