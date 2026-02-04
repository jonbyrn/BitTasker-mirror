import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config: where the app runs and where it calls the API
 *
 * - baseURL: where the browser loads the frontend. We always use localhost because we start the app
 *   via webServer (npm run dev). The browser never opens a deployed URL in our current flow.
 * - webServer: starts the SvelteKit app so the browser can load it. We pass env into that process:
 *   - VITE_E2E_TURNSTILE_BYPASS=true so the signup page skips Turnstile in e2e.
 *   - VITE_API_URL: where the frontend sends API/GraphQL requests. Set this to your dev backend
 *     (e.g. Cloudflare dev) so the signup-onboarding test can call checkUsernameAvailability etc.
 *   So: we are not testing against a "local API" — we have no local backend. We run the frontend
 *   locally and point it at the remote dev API via VITE_API_URL (local and CI).
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',

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

  /* Start the app so the browser can load it. Env is passed to the dev server so the app gets VITE_* and bypass. */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120 * 1000,
    env: {
      VITE_E2E_TURNSTILE_BYPASS: 'true',
      ...process.env,
    },
  },
});
