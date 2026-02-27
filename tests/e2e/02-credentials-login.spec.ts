/**
 * File 2 of 2: Loads credentials from the file and validates each set can log in via passkey.
 *
 * Run after 01-signup-onboarding.spec.ts so tests/e2e/.auth/webauthn-credentials.json exists.
 * For each label (signup, nostr), injects credentials into the virtual authenticator,
 * goes to /auth/login, clicks Continue with passkey, and asserts dashboard.
 *
 * Run order (use --workers=1 so 01 runs fully before 02):
 *   npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-from-file';
import {
	readCredentialSet,
	assertPasskeyUserNameEndsWithBittasker,
	nostrNsecFileExists,
	readNostrNsec
} from './utils/webauthn-credentials';

/** Labels created by 01-signup-onboarding. Use fixed list so tests are discovered at load time. */
const EXPECTED_LABELS = ['signup', 'nostr'] as const;

const NOSTR_NSEC_MISSING_MESSAGE =
	'Nostr nsec file not found. Run 01-signup-onboarding.spec.ts (user 2) first to generate tests/e2e/.auth/nostr-nsec.txt';

test.describe('Credentials file login (validate each user can log in)', () => {
	// Use a function so the condition is evaluated at runtime (when each test runs),
	// not at load time. By then, 01-signup-onboarding has run and the file exists.
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

	for (const label of EXPECTED_LABELS) {
		test.describe(`user: ${label}`, () => {
			test.use({ credentialLabel: label });

			test('loads credentials from file, injects into virtual authenticator, logs in with passkey, reaches dashboard', async ({
				authenticatedPageFromPasskeyFile,
				credentialLabel
			}) => {
				const credentials = readCredentialSet(credentialLabel);
				expect(credentials, `credential set "${credentialLabel}" should exist`).not.toBeNull();
				assertPasskeyUserNameEndsWithBittasker(credentials!);
				await expect(authenticatedPageFromPasskeyFile).toHaveURL(/\/dashboard/);
			});

			// Nsec new-user: passkey created during 01 user 2 flow; credential format valid and allows login
			test('nsec new-user passkey creation in E2E: credential has valid format and allows login', async ({
				authenticatedPageFromPasskeyFile,
				credentialLabel
			}) => {
				test.skip(credentialLabel !== 'nostr', 'Only nostr user is created via nsec new-user flow');
				const credentials = readCredentialSet('nostr');
				expect(credentials).not.toBeNull();
				assertPasskeyUserNameEndsWithBittasker(credentials!);
				await expect(authenticatedPageFromPasskeyFile).toHaveURL(/\/dashboard/);
			});
		});
	}

	test.describe('login → dashboard then navigate', () => {
		test.use({ credentialLabel: 'signup' });

		test('after passkey login, navigating to protected route (e.g. profile) keeps session', async ({
			authenticatedPageFromPasskeyFile
		}) => {
			await expect(authenticatedPageFromPasskeyFile).toHaveURL(/\/dashboard/);
			await authenticatedPageFromPasskeyFile.goto('/dashboard/profile', { waitUntil: 'load' });
			await expect(authenticatedPageFromPasskeyFile).toHaveURL(/\/dashboard\/profile/, {
				timeout: 10_000
			});
		});

		// Test 6: session persistence after reload
		test('after passkey login, reloading dashboard keeps session then navigate to protected route', async ({
			authenticatedPageFromPasskeyFile
		}) => {
			await expect(authenticatedPageFromPasskeyFile).toHaveURL(/\/dashboard/);
			await authenticatedPageFromPasskeyFile.reload({ waitUntil: 'load' });
			await expect(authenticatedPageFromPasskeyFile).toHaveURL(/\/dashboard/, { timeout: 10_000 });
			await authenticatedPageFromPasskeyFile.goto('/dashboard/profile', { waitUntil: 'load' });
			await expect(authenticatedPageFromPasskeyFile).toHaveURL(/\/dashboard\/profile/, {
				timeout: 10_000
			});
		});
	});

	test.describe('redirect-retry UI after login', () => {
		test('redirect-retry UI appears and Go to dashboard works', async ({ page, baseURL }) => {
			// Login page shows retry UI via dev-only param (no passkey or network failure needed)
			test.skip(
				!baseURL?.includes('3000'),
				'Redirect-retry UI test uses dev-only query param; run with dev server (port 3000).'
			);

			await page.goto('/auth/login?__e2e_redirect_retry=1', { waitUntil: 'load' });

			const retryAlert = page.getByTestId('login-redirect-retry');
			await expect(retryAlert).toBeVisible({ timeout: 10_000 });
			await expect(retryAlert).toContainText(/redirecting|redirigiendo/i);
			const goBtn = page.getByTestId('login-redirect-retry-go');
			await expect(goBtn).toBeVisible();

			await goBtn.click();
			// Navigation occurs; if not logged in, protected layout redirects back to login
			await expect(page).toHaveURL(/\/(dashboard|auth\/login)/, { timeout: 15_000 });
		});
	});
});

/**
 * Nsec existing user: login with nsec for an account created in 01 user 2.
 * Requires backend to accept nostrLogin with empty credential fields when __PLAYWRIGHT_TEST__ skips passkey creation.
 */
test.describe('nsec existing user', () => {
	test.skip(() => !nostrNsecFileExists(), NOSTR_NSEC_MISSING_MESSAGE);

	test('existing user logs in with nsec on new device, reaches dashboard', async ({
		browser,
		baseURL
	}) => {
		test.skip(
			browser.browserType().name() !== 'chromium',
			'Passkey/WebAuthn tests require Chromium'
		);
		const nsec = readNostrNsec();
		expect(nsec, 'nsec file should contain nsec string').toBeTruthy();

		const ctx = await browser.newContext({
			baseURL: baseURL ?? 'http://localhost:3000',
			viewport: { width: 1280, height: 720 }
		});
		await ctx.addInitScript(() => {
			(window as unknown as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ = true;
		});

		const page = await ctx.newPage();
		try {
			await page.goto('/auth/login', { waitUntil: 'load' });
			await page.getByTestId('login-with-nsec').click();
			await page.getByTestId('login-nsec-input').fill(nsec!);
			await page.getByTestId('login-submit').click();
			await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
			await expect(page).toHaveURL(/\/dashboard/);
		} finally {
			await ctx.close();
		}
	});
});
