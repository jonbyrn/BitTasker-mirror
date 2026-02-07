/**
 * File 2 of 2: Loads credentials from the file and validates each set can log in via passkey.
 *
 * Run after 01-signup-onboarding.spec.ts so tests/e2e/.auth/webauthn-credentials.json exists.
 * For each label in the file (e.g. "signup", "nostr"), injects credentials into the virtual
 * authenticator, goes to /auth/login, clicks Continue with passkey, and asserts dashboard.
 *
 * Run order (use --workers=1 so 01 runs fully before 02):
 *   npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	getCredentialSetLabels,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-from-file';

test.describe('Credentials file login (validate each user can log in)', () => {
	test.skip(
		!webauthnCredentialsFileExists(),
		CREDENTIALS_MISSING_MESSAGE
	);

	const labels = getCredentialSetLabels();
	for (const label of labels) {
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
