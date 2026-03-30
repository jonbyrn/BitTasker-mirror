import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config: where the app runs and where it calls the API
 *
 * - Local (CI not set): isolated build + preview on a dedicated port for deterministic E2E.
 * - CI with build/ present (e.g. from pipeline artifact): preview only (port 4173), no second build.
 * - CI without build/ (e.g. local `CI=1 npm run test:e2e`): build + preview (port 4173).
 *
 * Set VITE_API_URL in the environment so the app can reach the backend (signup/onboarding, passkey).
 * See docs/testing/e2e-testing.md for required environment variables.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
const PREVIEW_PORT = 4173;
// Use a dedicated local port for Playwright so we do not accidentally reuse a dev server
// from another checkout that also happens to be listening on 3000.
const DEV_PORT = Number(process.env.PLAYWRIGHT_DEV_PORT || 4000);
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
const DEV_URL = `http://localhost:${DEV_PORT}`;

const useLocalPreview = !process.env.CI;
/** In CI, if build/ already exists (pipeline artifact), run preview only to avoid a second build. */
const previewOnly = !!process.env.CI && existsSync(join(process.cwd(), 'build'));
const baseURL = useLocalPreview ? DEV_URL : PREVIEW_URL;

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
		storageState: process.env.AUTH_STATE_PATH || undefined
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},

		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] }
		},

		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] }
		},

		/* Test against mobile viewports. */
		{
			name: 'Mobile Chrome',
			use: { ...devices['Pixel 5'] }
		},
		{
			name: 'Mobile Safari',
			use: { ...devices['iPhone 12'] }
		},

		/* Authenticated tests - require auth state */
		{
			name: 'chromium-authenticated',
			use: {
				...devices['Desktop Chrome'],
				storageState: 'tests/e2e/.auth/test-user.json'
			},
			dependencies: [], // Don't require other projects
			testMatch: /.*\.authenticated\.spec\.ts/
		}

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

	/* Local: isolated build + preview. CI with build/ present: preview only. CI without build/: build + preview. */
	webServer: useLocalPreview
		? {
				command: `npm run build && npx vite preview --host --port ${DEV_PORT} --strictPort`,
				url: DEV_URL,
				reuseExistingServer: false,
				timeout: 300 * 1000,
				env: {
					VITE_E2E_TURNSTILE_BYPASS: 'true',
					...process.env
				}
			}
		: previewOnly
			? {
					command: 'npm run preview',
					url: PREVIEW_URL,
					reuseExistingServer: true,
					timeout: 60 * 1000,
					env: {
						VITE_E2E_TURNSTILE_BYPASS: 'true',
						...process.env
					}
				}
			: {
					command: 'npm run build && npm run preview',
					url: PREVIEW_URL,
					reuseExistingServer: !process.env.CI,
					timeout: 300 * 1000, // 5 min: build can be slow in CI
					env: {
						VITE_E2E_TURNSTILE_BYPASS: 'true',
						...process.env
					}
				}
});
