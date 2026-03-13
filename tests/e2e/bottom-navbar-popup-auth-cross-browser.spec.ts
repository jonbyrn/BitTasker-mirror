import type { TestInfo } from '@playwright/test';
import {
	test,
	expect,
	nostrCredentialsFileExists,
	NOSTR_CREDENTIALS_MISSING_MESSAGE
} from './fixtures/nostr-auth-cross-browser';
import { requireMobileSafari, openBottomMenu, activate } from './utils/ios-interactions';
import {
	AUTHENTICATED_BOTTOM_NAV_POPUP_ROUTES,
	navigateBottomNavPopupTo
} from './utils/bottom-nav-popup';

test.use({ nostrCredentialLabel: 'nostr' });
test.use({ credentialLabel: 'nostr' });

function requireBottomNavPopupSafariScope(testInfo: TestInfo): void {
	requireMobileSafari(testInfo, 'iOS Mobile Safari bottom popup-menu coverage only');
}

test.describe('authenticated bottom navbar popup menu navigation', () => {
	test.describe.configure({ retries: 1, timeout: 180_000 });

	test.beforeEach(() => {
		expect(nostrCredentialsFileExists(), NOSTR_CREDENTIALS_MISSING_MESSAGE).toBeTruthy();
	});

	for (const route of Object.values(AUTHENTICATED_BOTTOM_NAV_POPUP_ROUTES)) {
		test(`${route.name} popup action works on iOS Safari`, async ({
			authenticatedPageNostrCrossBrowser
		}, testInfo) => {
			requireBottomNavPopupSafariScope(testInfo);

			const page = authenticatedPageNostrCrossBrowser;
			const currentPath = new URL(page.url()).pathname;
			if (currentPath !== route.startPath) {
				await page.goto(route.startPath, { waitUntil: 'load' });
			}
			await navigateBottomNavPopupTo(page, route);
		});
	}

	test('logout popup action signs out and returns to logged-out UI on iOS Safari', async ({
		authenticatedPageNostrCrossBrowser
	}, testInfo) => {
		requireBottomNavPopupSafariScope(testInfo);

		const page = authenticatedPageNostrCrossBrowser;
		if (new URL(page.url()).pathname !== '/dashboard') {
			await page.goto('/dashboard', { waitUntil: 'load' });
		}

		await openBottomMenu(page);
		const logoutButton = page.getByTestId('bottom-nav-popup-logout-button').first();
		await activate(logoutButton);

		const modal = page.locator('.modal.modal-open').first();
		await expect(modal).toBeVisible({ timeout: 10_000 });

		await modal.locator('.btn.btn-ghost').first().click();
		await expect(modal).toHaveCount(0);
		await expect(page).toHaveURL(/\/dashboard(?:\?(.*&)?tab=[^&]+)?$/);

		await openBottomMenu(page);
		await activate(logoutButton);
		await expect(modal).toBeVisible({ timeout: 10_000 });
		await modal.locator('.btn.btn-primary').first().click();

		await expect.poll(() => page.url(), { timeout: 20_000 }).toMatch(/\/$|\/auth\/login/);
		await expect
			.poll(
				() =>
					page.evaluate(() => ({
						token: window.localStorage.getItem('CapacitorStorage.access_token'),
						npub: window.localStorage.getItem('CapacitorStorage.npub')
					})),
				{ timeout: 10_000 }
			)
			.toEqual({ token: null, npub: null });
		await expect(
			page
				.locator(
					'[data-testid="login-link"], [data-testid="bottom-nav-login-link"], a[href="/auth/login"]'
				)
				.first()
		).toBeVisible({ timeout: 10_000 });
	});
});
