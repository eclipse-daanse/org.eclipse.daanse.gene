import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    vue(),
    nodePolyfills(), // stream, buffer, etc. für den XMI-Parser aus @emfts/core
  ],
  resolve: {
    // Sicherheitsnetz: alle EMF-Pakete müssen dieselbe Instanz benutzen,
    // sonst gäbe es zwei EPackageRegistry-Singletons zur Laufzeit.
    dedupe: ['vue', '@emfts/core', '@emfts/vue-registry', '@emfts/uimodel-composer'],
  },
  server: {
    proxy: {
      // Fennec Model Atlas: Die REST-API sendet keine CORS-Header, ein direkter
      // Aufruf aus dem Browser wird blockiert. Der Proxy hält es same-origin —
      // als baseUrl der Atlas-Verbindung '/atlas/rest' eintragen. Das Präfix
      // wird 1:1 gemappt (Context-Path des Atlas ist /atlas).
      // MODEL_ATLAS_URL zeigt den Proxy auf eine andere Instanz, etwa den
      // Compose-Setup aus data.atlas (dort ist der Atlas auf 8080).
      '/atlas': {
        target: process.env.MODEL_ATLAS_URL ?? 'http://localhost:8086',
        changeOrigin: true,
      },
    },
  },
});
