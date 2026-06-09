import { test as base, expect } from '@playwright/test';

/**
 * Cross-browser auth fixture using pre-seeded localStorage.
 *
 * Auth state is injected by global-setup.ts from the seed file.
 * Tests start already authenticated — no login flow, no passkey prompts.
 *
 * The app's nostrKeys.ts checks for __PLAYWRIGHT_TEST__ + __E2E_NSEC__
 * and seeds appStore.nostrKeys directly, bypassing all passkey/biometric paths.
 *
 * Usage:
 *   import { test, expect } from '../fixtures/cross-browser-auth';
 *   test('my test', async ({ authenticatedPage }) => { ... });
 */

type CrossBrowserAuthFixtures = {
	authenticatedPage: import('@playwright/test').Page;
};

export const test = base.extend<CrossBrowserAuthFixtures>({
	authenticatedPage: async ({ page }, use) => {
		// Must be set BEFORE any page script runs so nostrKeys.ts sees it
		await page.addInitScript(() => {
			window.__PLAYWRIGHT_TEST__ = true;
		});

		// Navigate to dashboard — the storageState from playwright.config.ts
		// already has access_token + __E2E_NSEC__ etc. in localStorage.
		await page.goto('/dashboard');

		// If we ended up on login, the seed is expired or missing
		if (page.url().includes('/auth/login')) {
			throw new Error('Auth seed expired or missing. Recreate tests/e2e/.auth/test-seed.json');
		}

		await use(page);
	}
});

export { expect };
