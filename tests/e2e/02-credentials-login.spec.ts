/**
 * File 2 of 2: Loads credentials from the file and validates each set can log in via passkey.
 *
 * Run after 01-signup-onboarding.spec.ts so tests/e2e/.auth/webauthn-credentials.json exists.
 * Builds authenticated state from passkey credentials and reuses it across browser projects,
 * then asserts dashboard access.
 *
 * Run order (use --workers=1 so 01 runs fully before 02):
 *   npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project="Mobile Safari" --workers=1
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

const EXPECTED_LABELS = ['signup', 'nostr'] as const;
const ACCESS_TOKEN_STORAGE_KEY = 'CapacitorStorage.access_token';

test.describe('Credentials file login', () => {
	// Use a function so the condition is evaluated at runtime (when each test runs),
	// not at load time. By then, 01-signup-onboarding has run and the file exists.
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

	for (const label of EXPECTED_LABELS) {
		test.describe(`user: ${label}`, () => {
			test.use({ credentialLabel: label });

			test('loads credentials from file, authenticates via passkey state, reaches dashboard', async ({
				authenticatedPageCrossBrowser
			}) => {
				await expect(authenticatedPageCrossBrowser).toHaveURL(/\/dashboard/);
			});

			test('auth state contains access token and survives reload + dashboard tab navigation', async ({
				authenticatedPageCrossBrowser,
				crossBrowserAuthBundle
			}) => {
				const page = authenticatedPageCrossBrowser;

				const hasAccessToken = crossBrowserAuthBundle.storageEntries.some(
					(entry) => entry.name === ACCESS_TOKEN_STORAGE_KEY && entry.value.length > 0
				);
				expect(
					hasAccessToken,
					`Expected ${ACCESS_TOKEN_STORAGE_KEY} in cross-browser auth bundle for ${label}`
				).toBeTruthy();

				await page.goto('/dashboard', { waitUntil: 'load' });
				await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);

				await page.reload({ waitUntil: 'load' });
				await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
				await expect(page.getByTestId('login-link')).toHaveCount(0);

				await page.goto('/dashboard?tab=bids', { waitUntil: 'load' });
				await expect(page).toHaveURL(/\/dashboard\?tab=bids$/);
				await expect(page.getByTestId('login-link')).toHaveCount(0);
			});

			test('fresh context stays unauthenticated and preserves route-guard behavior', async ({
				browser,
				crossBrowserAuthBundle
			}) => {
				const context = await browser.newContext({
					baseURL: crossBrowserAuthBundle.baseURL,
					storageState: { cookies: [], origins: [] }
				});
				const page = await context.newPage();

				try {
					await page.goto('/dashboard', { waitUntil: 'load' });
					await expect
						.poll(() => page.url(), { timeout: 10_000 })
						.toMatch(/\/dashboard(?:\?tab=tasks)?$|\/auth\/login(?:\?.*)?$/);

					await page.goto('/dashboard/messages', { waitUntil: 'load' });
					await expect
						.poll(() => page.url(), { timeout: 10_000 })
						.toMatch(/\/auth\/login(?:\?.*)?$/);

					await page.goto('/dashboard/wallet', { waitUntil: 'load' });
					await expect
						.poll(() => page.url(), { timeout: 10_000 })
						.toMatch(/\/auth\/login(?:\?.*)?$/);
				} finally {
					await context.close();
				}
			});
		});
	}
});
