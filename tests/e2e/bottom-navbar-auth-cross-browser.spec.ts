import {
	test,
	expect,
	nostrCredentialsFileExists,
	NOSTR_CREDENTIALS_MISSING_MESSAGE
} from './fixtures/nostr-auth-cross-browser';
import { AUTHENTICATED_BOTTOM_NAV_ROUTES, navigateBottomNavTo } from './utils/bottom-nav';
import { requireMobileSafari } from './utils/ios-interactions';
import type { TestInfo } from '@playwright/test';

test.use({ nostrCredentialLabel: 'nostr' });
test.use({ credentialLabel: 'nostr' });

function requireBottomNavSafariScope(testInfo: TestInfo): void {
	requireMobileSafari(testInfo, 'iOS Mobile Safari bottom navbar coverage only');
}

test.describe('authenticated bottom navbar navigation', () => {
	test.describe.configure({ retries: 0, timeout: 140_000 });

	test.beforeEach(() => {
		expect(nostrCredentialsFileExists(), NOSTR_CREDENTIALS_MISSING_MESSAGE).toBeTruthy();
	});

	test('wallet button reaches the wallet route on iOS Safari', async ({
		authenticatedPageNostrCrossBrowser
	}, testInfo) => {
		requireBottomNavSafariScope(testInfo);

		const page = authenticatedPageNostrCrossBrowser;
		await page.goto('/dashboard', { waitUntil: 'load' });
		await navigateBottomNavTo(page, AUTHENTICATED_BOTTOM_NAV_ROUTES.wallet);
	});

	test('home button returns to the dashboard home route on iOS Safari', async ({
		authenticatedPageNostrCrossBrowser
	}, testInfo) => {
		requireBottomNavSafariScope(testInfo);

		const page = authenticatedPageNostrCrossBrowser;
		await page.goto('/dashboard/create-task', { waitUntil: 'load' });
		await navigateBottomNavTo(page, AUTHENTICATED_BOTTOM_NAV_ROUTES.home);
	});

	test('create task button reaches the create-task route on iOS Safari', async ({
		authenticatedPageNostrCrossBrowser
	}, testInfo) => {
		requireBottomNavSafariScope(testInfo);

		const page = authenticatedPageNostrCrossBrowser;
		await page.goto('/dashboard/messages', { waitUntil: 'load' });
		await navigateBottomNavTo(page, AUTHENTICATED_BOTTOM_NAV_ROUTES.createTask);
	});

	test('messages button reaches the messages route on iOS Safari', async ({
		authenticatedPageNostrCrossBrowser
	}, testInfo) => {
		requireBottomNavSafariScope(testInfo);

		const page = authenticatedPageNostrCrossBrowser;
		await page.goto('/dashboard', { waitUntil: 'load' });
		await navigateBottomNavTo(page, AUTHENTICATED_BOTTOM_NAV_ROUTES.messages);
	});
});
