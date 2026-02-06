import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config: where the app runs and where it calls the API
 *
 * - CI: build + preview (port 4173) for a stable bundle and no cold start.
 * - Local with E2E_USE_DEV_SERVER=1: npm run dev (port 3000) for faster iteration.
 *
 * Build/dev receive VITE_E2E_TURNSTILE_BYPASS and VITE_API_URL from env. Set VITE_API_URL
 * to your dev backend so signup/onboarding (username check, passkey registration) can reach the API.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
const PREVIEW_PORT = 4173;
const DEV_PORT = 3000;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
const DEV_URL = `http://localhost:${DEV_PORT}`;

const useDevServer = process.env.E2E_USE_DEV_SERVER === '1' && !process.env.CI;
const baseURL = useDevServer ? DEV_URL : PREVIEW_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,

    trace: 'off',
    screenshot: 'off',
    video: 'off',
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

  /* Local: E2E_USE_DEV_SERVER=1 uses dev server (faster). CI always uses build + preview. */
  webServer: useDevServer
    ? {
        command: 'npm run dev',
        url: DEV_URL,
        reuseExistingServer: true,
        timeout: 60 * 1000,
        env: {
          VITE_E2E_TURNSTILE_BYPASS: 'true',
          ...process.env,
        },
      }
    : {
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
