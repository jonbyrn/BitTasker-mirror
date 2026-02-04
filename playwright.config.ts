import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config: where the app runs and where it calls the API
 *
 * We use build + preview (not dev) so the app is a stable, production-like bundle with no Vite
 * cold start or hydration races. baseURL points at the preview server (port 4173).
 *
 * - webServer: runs "npm run build && npm run preview". Build receives VITE_E2E_TURNSTILE_BYPASS
 *   and VITE_API_URL (and other process.env) so they are baked into the client. Preview serves
 *   the built app on port 4173.
 * - VITE_API_URL: set in env (local and CI) so the built app calls your dev backend for
 *   checkUsernameAvailability etc.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['list']
      ]
    : 'html',
  use: {
    baseURL: PREVIEW_URL,

    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: process.env.AUTH_STATE_PATH || undefined,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    /* Authenticated tests - require auth state */
    {
      name: 'chromium-authenticated',
      use: { 
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/test-user.json',
      },
      dependencies: [], // Don't require other projects
      testMatch: /.*\.authenticated\.spec\.ts/,
    },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Build + preview: stable bundle, no dev cold start. Env is passed to build so VITE_* are baked in. */
  webServer: {
    command: 'npm run build && npm run preview',
    url: PREVIEW_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300 * 1000, // 5 min: build can be slow in CI
    env: {
      VITE_E2E_TURNSTILE_BYPASS: 'true',
      ...process.env,
    },
  },
});
