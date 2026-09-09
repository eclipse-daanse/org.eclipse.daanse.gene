import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    // 'node', weil die Tests am Modell und am Serializer arbeiten, nicht am DOM
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
