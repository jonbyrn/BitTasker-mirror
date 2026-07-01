/**
 * Logout should NOT trigger a passkey/biometric prompt.
 *
 * Bug: After logout, the reviews page's $effect re-runs (because Svelte
 * destroys and recreates children when ProtectedLayout's isAuthenticated
 * branch switches), calling getNpub() with empty caches.  getNpub() falls
 * through to getBiometrics() → Webauthn.startAuthentication(), which
 * shows the system passkey prompt.
 *
 * Fix: 1) Reviews page uses onMount instead of $effect (keys are already
 *      loaded by the parent layout).  2) Logout navigates away before
 *      resetting auth state so child components are already unmounted.
 */
import { test as base, expect } from '@playwright/test';

const test = base.extend<{ authenticatedPage: import('@playwright/test').Page }>({
	authenticatedPage: async ({ page }, use) => {
		await page.addInitScript(() => {
			window.__PLAYWRIGHT_TEST__ = true;
			const P = 'CapacitorStorage.';
			localStorage.setItem('access_token', 'e2e-test-token');
			localStorage.setItem(P + 'access_token', 'e2e-test-token');
			localStorage.setItem('auth_method', 'nostr');
			localStorage.setItem(P + 'auth_method', 'nostr');
			localStorage.setItem('onboardingCompleted', 'true');
			localStorage.setItem(P + 'onboardingCompleted', 'true');
		});

		await page.goto('/hiring');
		await page.waitForLoadState('networkidle');

		await use(page);
	}
});

async function dismissOverlays(page: import('@playwright/test').Page) {
	const closeButtons = page.locator('.modal-backdrop, [aria-label*="ismiss"]');
	for (const btn of await closeButtons.all()) {
		try {
			await btn.click({ timeout: 500 });
		} catch {
			/* no overlay */
		}
	}
	await page.waitForTimeout(300);
}

test.describe('Logout does not trigger passkey prompt', () => {
	test.describe.configure({ mode: 'serial' });

	test('no getNpub call or challenge request after logout from reviews page', async ({
		authenticatedPage
	}) => {
		const page = authenticatedPage;

		await page.goto('/reviews');
		await page.waitForLoadState('networkidle');
		await dismissOverlays(page);

		// Track API calls to the challenge endpoint (triggered by getBiometrics → passkey)
		const challengeRequests: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/api/v1/auth/challenge')) {
				challengeRequests.push(request.url());
			}
		});

		// Track console errors that indicate getNpub failed (falls through to biometrics in browser)
		const consoleErrors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				consoleErrors.push(msg.text());
			}
		});

		// Reset tracking after initial page load settles
		await page.waitForTimeout(500);
		challengeRequests.length = 0;
		consoleErrors.length = 0;

		// Perform logout
		await page.evaluate(async () => {
			const { authState } = await import('/src/lib/stores/auth.store.ts');
			await authState.logout();
		});

		// Wait for navigation and any reactive effects to settle
		await page.waitForURL(/\/(auth\/login)?(\?.*)?$/, { timeout: 10000 });
		await page.waitForTimeout(1500);

		// Assert: no challenge API request was made after logout
		expect(
			challengeRequests,
			`Expected no passkey challenge requests after logout, but got ${challengeRequests.length}`
		).toHaveLength(0);

		// Assert: no "No biometric data found" error (indicates getNpub fell through to biometrics)
		const biometricErrors = consoleErrors.filter(
			(e) => e.includes('biometric') || e.includes('No biometric data found')
		);
		expect(
			biometricErrors.length,
			`Expected no biometric errors after logout, but got: ${biometricErrors.join(', ')}`
		).toBe(0);
	});

	test('no challenge request after logout from hiring page', async ({ authenticatedPage }) => {
		const page = authenticatedPage;

		await page.goto('/hiring');
		await page.waitForLoadState('networkidle');
		await dismissOverlays(page);

		const challengeRequests: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/api/v1/auth/challenge')) {
				challengeRequests.push(request.url());
			}
		});

		// Perform logout
		await page.evaluate(async () => {
			const { authState } = await import('/src/lib/stores/auth.store.ts');
			await authState.logout();
		});

		await page.waitForURL(/\/(auth\/login)?(\?.*)?$/, { timeout: 10000 });
		await page.waitForTimeout(1000);

		expect(
			challengeRequests,
			`Expected no passkey challenge requests after logout, but got ${challengeRequests.length}`
		).toHaveLength(0);
	});

	test('logout from protected page navigates away cleanly', async ({ authenticatedPage }) => {
		const page = authenticatedPage;

		await page.goto('/reviews');
		await page.waitForLoadState('networkidle');
		await dismissOverlays(page);

		// Track console errors after logout
		const consoleErrors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				consoleErrors.push(msg.text());
			}
		});

		// Perform logout (same code path as the UI logout button)
		await page.evaluate(async () => {
			const { authState } = await import('/src/lib/stores/auth.store.ts');
			await authState.logout();
		});

		// Should navigate away to root or login
		await expect(page).toHaveURL(/\/(auth\/login)?(\?.*)?$/, { timeout: 10000 });

		// No biometric errors should appear (would indicate getNpub was called post-logout)
		await page.waitForTimeout(1000);
		const biometricErrors = consoleErrors.filter(
			(e) => e.includes('biometric') || e.includes('No biometric data found')
		);
		expect(
			biometricErrors.length,
			`Expected no biometric errors after logout, but got: ${biometricErrors.join(', ')}`
		).toBe(0);
	});
});
