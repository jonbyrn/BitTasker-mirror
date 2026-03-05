import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config: where the app runs and where it calls the API
 *
 * - Local (CI not set): dev server (port 3000) for faster iteration.
 * - CI with build/ present (e.g. from pipeline artifact): preview only (port 4173), no second build.
 * - CI without build/ (e.g. local `CI=1 npm run test:e2e`): build + preview (port 4173).
 *
 * Set VITE_API_URL in the environment so the app can reach the backend (signup/onboarding, passkey).
 * See docs/testing/e2e-testing.md for required environment variables.
 *
 * Passkey/WebAuthn tests require Chromium (CDP for virtual authenticators). The e2e-ordered script
 * (npm run test:e2e) runs with --project=chromium by default. Firefox/WebKit/Mobile Safari tests
 * that use passkeys are automatically skipped. See tests/e2e/README.md.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
const PREVIEW_PORT = 4173;
const DEV_PORT = 3000;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
const DEV_URL = `http://localhost:${DEV_PORT}`;

const useDevServer = !process.env.CI;
/** In CI, if build/ already exists (pipeline artifact), run preview only to avoid a second build. */
const previewOnly = !!process.env.CI && existsSync(join(process.cwd(), 'build'));
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

	/* Local: dev server. CI with build/ present: preview only. CI without build/: build + preview. */
	webServer: useDevServer
		? {
				command: 'npm run dev',
				url: DEV_URL,
				reuseExistingServer: true,
				timeout: 60 * 1000,
				env: {
					VITE_E2E_TURNSTILE_BYPASS: 'true',
					...process.env
				}
			}
		: previewOnly
			? {
					command: 'npm run preview',
					url: PREVIEW_URL,
					reuseExistingServer: false,
					timeout: 15 * 1000,
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
