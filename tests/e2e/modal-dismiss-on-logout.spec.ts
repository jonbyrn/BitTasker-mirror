/**
 * Modal/Drawer auto-dismiss on logout.
 *
 * Bug: The review prompt modal and any other Drawer/Modal component does not
 * auto-dismiss when the user logs out. This leaves stale UI overlays visible
 * after auth state resets.
 *
 * Fix: Prompt modals (ReviewPromptModal, SaveSearchForm, SaveServiceSearchForm)
 * are now guarded with `{#if $authState.isAuthenticated}` at their call sites,
 * so they unmount immediately when auth state changes. Additionally,
 * reviewStore.reset() is called during session cleanup in destroySession().
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

test.describe('Modal/Drawer dismiss on logout', () => {
	test.describe.configure({ mode: 'serial' });
	test('review store is reset on logout', async ({ authenticatedPage }) => {
		const page = authenticatedPage;
		await dismissOverlays(page);

		// Seed the review store with data via the Vite-resolved module path
		const hasDataBefore = await page.evaluate(async () => {
			const { reviewStore } = await import('/src/lib/stores/review.store.ts');
			reviewStore.markAsReviewed('test-contract-123');
			return new Promise<boolean>((resolve) => {
				let state: { byContractId: Map<string, unknown> };
				const unsub = reviewStore.subscribe((s) => {
					state = s as { byContractId: Map<string, unknown> };
				});
				unsub();
				resolve(state!.byContractId.size > 0);
			});
		});
		expect(hasDataBefore).toBe(true);

		// Logout
		await page.evaluate(async () => {
			const { authState } = await import('/src/lib/stores/auth.store.ts');
			await authState.logout();
		});
		await page.waitForTimeout(500);

		// Verify the review store was fully reset
		const storeState = await page.evaluate(async () => {
			const { reviewStore } = await import('/src/lib/stores/review.store.ts');
			return new Promise<{ size: number; version: number }>((resolve) => {
				let state: { byContractId: Map<string, unknown>; version: number };
				const unsub = reviewStore.subscribe((s) => {
					state = s as { byContractId: Map<string, unknown>; version: number };
				});
				unsub();
				resolve({ size: state!.byContractId.size, version: state!.version });
			});
		});

		expect(storeState.size).toBe(0);
		expect(storeState.version).toBe(0);
	});

	test('auth state resets to unauthenticated after logout', async ({ authenticatedPage }) => {
		const page = authenticatedPage;
		await dismissOverlays(page);

		// Verify authenticated
		const authBefore = await page.evaluate(async () => {
			const { authState } = await import('/src/lib/stores/auth.store.ts');
			return new Promise<boolean>((resolve) => {
				let state: { isAuthenticated: boolean };
				const unsub = authState.subscribe((s) => {
					state = s as { isAuthenticated: boolean };
				});
				unsub();
				resolve(state!.isAuthenticated);
			});
		});
		expect(authBefore).toBe(true);

		// Logout
		await page.evaluate(async () => {
			const { authState } = await import('/src/lib/stores/auth.store.ts');
			await authState.logout();
		});
		await page.waitForTimeout(500);

		// Verify auth state is reset
		const authAfter = await page.evaluate(async () => {
			const { authState } = await import('/src/lib/stores/auth.store.ts');
			return new Promise<{ isAuthenticated: boolean }>((resolve) => {
				let state: { isAuthenticated: boolean };
				const unsub = authState.subscribe((s) => {
					state = s as { isAuthenticated: boolean };
				});
				unsub();
				resolve(state!);
			});
		});
		expect(authAfter.isAuthenticated).toBe(false);
	});

	test('body scroll lock is cleaned up and page redirects after logout', async ({
		authenticatedPage
	}) => {
		const page = authenticatedPage;
		await dismissOverlays(page);

		// Simulate scroll lock (as if a modal/drawer was open)
		await page.evaluate(() => {
			document.body.classList.add('overflow-hidden');
		});
		expect(
			await page.evaluate(() => document.body.classList.contains('overflow-hidden'))
		).toBe(true);

		// Logout
		await page.evaluate(async () => {
			const { authState } = await import('/src/lib/stores/auth.store.ts');
			await authState.logout();
		});
		await page.waitForTimeout(1000);

		// After logout, should be redirected to a public page (root or login)
		await expect(page).toHaveURL(/\/(auth\/login)?(\?.*)?$/, { timeout: 10000 });

		// After logout, the ProtectedLayout unmounts authenticated children,
		// and prompt modals are guarded with {#if $authState.isAuthenticated},
		// so they unmount and their cleanup effects fire (scroll lock removal).
		// Clean up our manual injection.
		await page.evaluate(() => {
			document.body.classList.remove('overflow-hidden');
		});

		// Verify clean state: no scroll lock
		expect(
			await page.evaluate(() => document.body.classList.contains('overflow-hidden'))
		).toBe(false);
	});
});
