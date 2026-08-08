import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,

  expect: {
    // Screenshot-Baselines: minimales Anti-Aliasing-/Scrollbar-Rauschen
    // tolerieren; strukturelle Abweichungen liegen um Groessenordnungen hoeher.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },

  use: {
    // E2E_BASE_URL erlaubt einen Lauf gegen einen bereits laufenden Dev-Server
    // auf abweichendem Port (Vite weicht aus, wenn 5173 belegt ist).
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
