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

/** Labels created by 01-signup-onboarding. Use fixed list so tests are discovered at load time. */
const EXPECTED_LABELS = ['signup', 'nostr'] as const;

test.describe('Credentials file login (validate each user can log in)', () => {
	// Use a function so the condition is evaluated at runtime (when each test runs),
	// not at load time. By then, 01-signup-onboarding has run and the file exists.
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

	for (const label of EXPECTED_LABELS) {
		test.describe(`user: ${label}`, () => {
			test.use({ credentialLabel: label });

			test('loads credentials from file, injects into virtual authenticator, logs in with passkey, reaches dashboard', async ({
				authenticatedPageFromPasskeyFile
			}) => {
				await expect(authenticatedPageFromPasskeyFile).toHaveURL(/\/dashboard/);
			});
		});
	}

	test.describe('Auth plugin / GraphQL after login', () => {
		test.use({ credentialLabel: 'signup' });

		test('after login, GraphQL requests succeed (no 401) and send Authorization header', async ({
			pageAndCompleteLogin
		}) => {
			const { page, completeLogin } = pageAndCompleteLogin;
			const graphqlResponses: { status: number }[] = [];
			const graphqlAuthHeaders: (string | undefined)[] = [];

			// Attach before navigation to dashboard so we capture layout/init GraphQL (e.g. push notification)
			page.on('response', (response) => {
				if (response.url().includes('/graph')) {
					graphqlResponses.push({ status: response.status() });
				}
			});
			page.on('request', (request) => {
				if (request.url().includes('/graph')) {
					graphqlAuthHeaders.push(request.headers()['authorization']);
				}
			});

			await completeLogin();
			await page.waitForLoadState('networkidle');

			const status401 = graphqlResponses.filter((r) => r.status === 401);
			expect(status401, 'GraphQL should not return 401 after login').toHaveLength(0);

			const status2xx = graphqlResponses.filter((r) => r.status >= 200 && r.status < 300);
			expect(status2xx.length, 'At least one GraphQL request should succeed (2xx)').toBeGreaterThan(
				0
			);

			const withBearer = graphqlAuthHeaders.filter((h) => h?.startsWith('Bearer '));
			expect(
				withBearer.length,
				'At least one GraphQL request should send Authorization: Bearer'
			).toBeGreaterThan(0);
		});
	});
});
