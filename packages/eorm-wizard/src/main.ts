import { createApp } from 'vue';
import 'primeicons/primeicons.css';
import { EmftsRendererPlugin, componentRegistry } from '@emfts/vue-registry';
import App from './App.vue';

const app = createApp(App);
app.use(EmftsRendererPlugin, { registry: componentRegistry });
app.mount('#app');

// Debug-Zugriff für Entwicklung (Registry-Inhalt im Browser inspizierbar)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__registry = componentRegistry;
}
