import type { TestInfo } from '@playwright/test';
import {
	test,
	expect,
	nostrCredentialsFileExists,
	NOSTR_CREDENTIALS_MISSING_MESSAGE
} from './fixtures/nostr-auth-cross-browser';
import { requireMobileSafari } from './utils/ios-interactions';
import {
	AUTHENTICATED_QUICK_ACTION_POPUP_ROUTES,
	AUTHENTICATED_SUPPORT_POPUP_ROUTES,
	AUTHENTICATED_TASK_MANAGEMENT_EXTRA_POPUP_ROUTES,
	navigateBottomNavPopupTo
} from './utils/bottom-nav-popup';

test.use({ nostrCredentialLabel: 'nostr' });
test.use({ credentialLabel: 'nostr' });

function requireBottomNavPopupSafariScope(testInfo: TestInfo): void {
	requireMobileSafari(testInfo, 'iOS Mobile Safari bottom popup-menu coverage only');
}

test.describe('authenticated bottom navbar popup menu extended navigation', () => {
	test.describe.configure({ retries: 1, timeout: 180_000 });

	test.beforeEach(() => {
		expect(nostrCredentialsFileExists(), NOSTR_CREDENTIALS_MISSING_MESSAGE).toBeTruthy();
	});

	for (const route of [
		...AUTHENTICATED_SUPPORT_POPUP_ROUTES,
		...AUTHENTICATED_TASK_MANAGEMENT_EXTRA_POPUP_ROUTES,
		...AUTHENTICATED_QUICK_ACTION_POPUP_ROUTES
	]) {
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
});
