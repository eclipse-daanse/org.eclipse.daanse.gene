import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

/**
 * Zwei Testwelten unter einem Dach.
 *
 * gene selbst testet gegen jsdom und braucht dafuer die vite.config mit ihren
 * Plugins. Die eingezogenen Wizards bringen eigene vitest.config.ts mit
 * (environment 'node') und sind auf gene's Plugins nicht ausgelegt: Unter der
 * gemeinsamen Konfiguration reicht `import.meta.url` nicht mehr als file:-URL
 * durch, woran `fileURLToPath` in ihren Tests scheitert
 * (ERR_INVALID_URL_SCHEME). Als eigene Projekte laufen sie mit ihrer eigenen
 * Konfiguration — und laufen im selben Durchgang mit, statt uebersprungen zu
 * werden.
 */
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        viteConfig,
        defineConfig({
          test: {
            name: 'gene',
            environment: 'jsdom',
            setupFiles: ['./vitest.setup.ts'],
            exclude: [...configDefaults.exclude, 'e2e/**', 'packages/*-wizard/**'],
            root: fileURLToPath(new URL('./', import.meta.url)),
          },
        }),
      ),
      'packages/sensinact-mapping-wizard',
      'packages/eorm-wizard',
    ],
  },
})
