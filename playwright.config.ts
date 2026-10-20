import { defineConfig } from '@playwright/test'

/**
 * Browser end-to-end suite (tests/e2e, `npm run test:e2e` through scripts/e2e-browser.sh). It runs against the local
 * full stack (`npm run dev:full`, real shared database and real bucket), so it is started only by the wrapper.
 * Specs run one at a time: they share the test owner and clean up after each other.
 */
const BASE_URL = 'http://localhost:8888'

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  retries: 0,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: './tests/e2e/support/global-setup.ts',
  globalTeardown: './tests/e2e/support/global-teardown.ts',
  outputDir: 'test-results',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // the editor flow is a desktop task; every spec of this project runs
      name: 'desktop-light',
      use: { viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
    },
    {
      // the player and the lesson are checked on a phone too (bottom bar, dark mode)
      name: 'phone-dark',
      testMatch: /(quiz-player-images|lesson-images)\.spec\.ts$/,
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      },
    },
  ],
  webServer: {
    command: 'npm run dev:full',
    url: `${BASE_URL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: process.env as Record<string, string>,
  },
})
