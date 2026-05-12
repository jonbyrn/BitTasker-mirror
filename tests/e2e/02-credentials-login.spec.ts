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
import { WEBAUTHN_CHROMIUM_ONLY_MESSAGE } from './utils/onboarding-helpers';

/** Labels created by 01-signup-onboarding. Use fixed list so tests are discovered at load time. */
const EXPECTED_LABELS = ['signup', 'nostr'] as const;

test.describe('Credentials file login (validate each user can log in)', () => {
	test.describe.configure({ timeout: 90_000 });
	test.skip(({ browserName }) => browserName !== 'chromium', WEBAUTHN_CHROMIUM_ONLY_MESSAGE);
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
});
