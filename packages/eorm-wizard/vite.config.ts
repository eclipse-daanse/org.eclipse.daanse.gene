import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    vue(),
    nodePolyfills(), // stream, buffer, etc. für @emfts/core XMI-Parser
  ],
  resolve: {
    // Sicherheitsnetz: alle EMF-Pakete müssen dieselbe Instanz benutzen,
    // sonst gäbe es zwei EPackageRegistry-Singletons zur Laufzeit.
    dedupe: ['vue', '@emfts/core', '@emfts/vue-registry', '@emfts/uimodel-composer'],
  },
  server: {
    proxy: {
      // Fennec Model Atlas: Die REST-API sendet keine CORS-Header, ein direkter
      // Aufruf von http://localhost:8086 aus dem Browser wird blockiert. Der
      // Proxy hält es same-origin — als baseUrl der Atlas-Verbindung '/atlas/rest'
      // eintragen. Das Präfix wird 1:1 gemappt (Context-Path des Atlas ist /atlas).
      // Gleiche Konfiguration wie in gene/vite.config.ts.
      '/atlas': {
        target: 'http://localhost:8086',
        changeOrigin: true,
      },
    },
  },
});
