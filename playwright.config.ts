import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config: where the app runs and where it calls the API
 *
 * - Local (CI not set): dev server (port 3000) for faster iteration.
 * - Managed CI with pipeline build artifacts present: preview only (port 4173), no second build.
 * - Local `CI=1` runs: build + preview (port 4173) unless preview artifact reuse is explicitly enabled.
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
const PREVIEW_HOST = '127.0.0.1';
const PREVIEW_URL = `http://${PREVIEW_HOST}:${PREVIEW_PORT}`;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const PREVIEW_START_TIMEOUT_MS = 60 * 1000;
const isManagedCi =
	process.env.GITLAB_CI === 'true' ||
	process.env.CI_SERVER === 'yes' ||
	typeof process.env.CI_PIPELINE_ID === 'string';
const allowPreviewArtifactReuse = process.env.PW_E2E_USE_PREVIEW_ARTIFACTS === 'true';
const overrideBaseURL = process.env.PW_E2E_BASE_URL?.trim() || null;

function hasPreviewArtifacts(cwd = process.cwd()) {
	return (
		existsSync(join(cwd, 'build/index.html')) &&
		existsSync(join(cwd, '.svelte-kit/output/client')) &&
		existsSync(join(cwd, '.svelte-kit/output/server/manifest.js'))
	);
}

const useDevServer = !process.env.CI;
/**
 * Only reuse prebuilt preview artifacts when we are inside managed CI (for example GitLab)
 * or when explicitly requested. Local `CI=1` runs should rebuild so they do not serve stale
 * output from a previous frontend state.
 */
const previewOnly = (isManagedCi || allowPreviewArtifactReuse) && hasPreviewArtifacts();
const baseURL = overrideBaseURL ?? (useDevServer ? DEV_URL : PREVIEW_URL);

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'list',
	globalSetup: './tests/e2e/global-setup.ts',
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
			use: {
				...devices['Desktop Chrome'],
				storageState: process.env.AUTH_STATE_PATH || 'tests/e2e/.auth/chromium-auth.json'
			}
		},

		{
			name: 'firefox',
			use: {
				...devices['Desktop Firefox'],
				storageState: process.env.AUTH_STATE_PATH || 'tests/e2e/.auth/firefox-auth.json'
			}
		},

		{
			name: 'webkit',
			use: {
				...devices['Desktop Safari'],
				storageState: process.env.AUTH_STATE_PATH || 'tests/e2e/.auth/webkit-auth.json'
			}
		},

		/* Test against mobile viewports. */
		{
			name: 'Mobile Chrome',
			use: {
				...devices['Pixel 5'],
				storageState: process.env.AUTH_STATE_PATH || 'tests/e2e/.auth/chromium-auth.json'
			}
		},
		{
			name: 'Mobile Safari',
			use: {
				...devices['iPhone 12'],
				storageState: process.env.AUTH_STATE_PATH || 'tests/e2e/.auth/webkit-auth.json'
			}
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

	/* Local: dev server. Managed CI artifact reuse: preview only. Otherwise: build + preview. */
	webServer: overrideBaseURL
		? undefined
		: useDevServer
			? {
					command: 'npm run dev:dev',
					url: DEV_URL,
					reuseExistingServer: true,
					timeout: 60 * 1000,
					env: {
						VITE_API_URL: 'http://localhost:8000',
						VITE_E2E_TURNSTILE_BYPASS: 'true',
						VITE_BITCOIN_NETWORK: 'testnet',
						VITE_BITCOIN_ELECTRUM_URL: 'ssl://electrum.blockstream.info:60002',
						...process.env
					}
				}
			: previewOnly
				? {
						command: `npm run preview -- --host ${PREVIEW_HOST} --port ${PREVIEW_PORT}`,
						url: PREVIEW_URL,
						reuseExistingServer: false,
						timeout: PREVIEW_START_TIMEOUT_MS,
						env: {
							VITE_API_URL: 'http://localhost:8000',
							VITE_E2E_TURNSTILE_BYPASS: 'true',
							VITE_BITCOIN_NETWORK: 'testnet',
							VITE_BITCOIN_ELECTRUM_URL: 'ssl://electrum.blockstream.info:60002',
							...process.env
						}
					}
				: {
						command: `npm run build && npm run preview -- --host ${PREVIEW_HOST} --port ${PREVIEW_PORT}`,
						url: PREVIEW_URL,
						reuseExistingServer: !process.env.CI,
						timeout: 600 * 1000, // 10 min: full SvelteKit preview build is slow in CI/local CI-shaped runs
						env: {
							VITE_API_URL: 'http://localhost:8000',
							VITE_E2E_TURNSTILE_BYPASS: 'true',
							VITE_BITCOIN_NETWORK: 'testnet',
							VITE_BITCOIN_ELECTRUM_URL: 'ssl://electrum.blockstream.info:60002',
							...process.env
						}
					}
});
