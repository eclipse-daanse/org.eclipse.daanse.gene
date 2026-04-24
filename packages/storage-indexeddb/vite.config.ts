import { defineConfig } from 'vite'
import federation from '@originjs/vite-plugin-federation'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    federation({
      name: 'storage-indexeddb',
      filename: 'remoteEntry.js',
      // Expose the adapter and registration
      exposes: {
        './adapter': './src/IndexedDBAdapter.ts',
        './register': './src/index.ts'
      },
      // Shared dependencies for production builds
      shared: {
        vue: {
          singleton: true,
          requiredVersion: '^3.5.0'
        },
        emfts: {
          singleton: true
        },
        'reflect-metadata': {
          singleton: true
        },
        inversify: {
          singleton: true
        },
        'gene-core': {
          singleton: true
        },
        'storage-core': {
          singleton: true
        },
        'storage-model': {
          singleton: true
        }
      }
    })
  ],
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    lib: {
      entry: './src/index.ts',
      formats: ['es']
    },
    rollupOptions: {
      external: [
        'vue',
        '@emfts/core',
        'gene-core',
        'storage-core',
        'storage-model'
      ]
    }
  },
  server: {
    port: 5001,
    strictPort: true,
    cors: true
  },
  preview: {
    port: 5001,
    strictPort: true,
    cors: true
  }
})
