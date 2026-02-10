import { test as base, expect } from '@playwright/test';
import {
	readWebAuthnCredentialsFromFile,
	webauthnCredentialsFileExists
} from '../utils/webauthn-credentials';

/** Re-export so specs can skip when file is missing */
export { webauthnCredentialsFileExists };

const CREDENTIALS_MISSING_MESSAGE =
	'WebAuthn credentials file not found. Run signup-onboarding.spec.ts first to generate tests/e2e/.auth/webauthn-credentials.json';

/** Virtual authenticator options (must match signup-login-auth and auth fixtures). */
const VIRTUAL_AUTHENTICATOR_OPTIONS = {
	protocol: 'ctap2' as const,
	ctap2Version: 'ctap2_1' as const,
	transport: 'internal' as const,
	hasResidentKey: true,
	hasUserVerification: true,
	isUserVerified: true,
	automaticPresenceSimulation: true
};

type PasskeyAuthFromFileFixtures = {
	/** Page already logged in via passkey using credentials from webauthn-credentials.json */
	authenticatedPageFromPasskeyFile: import('@playwright/test').Page;
};

/**
 * Fixture for specs that reuse the passkey created by signup-onboarding.
 * Reads tests/e2e/.auth/webauthn-credentials.json, injects credentials into a virtual
 * authenticator, then performs login (goto /auth/login → Continue with passkey → dashboard).
 *
 * Requires signup-onboarding.spec.ts to have been run first in the same run (or a previous
 * run that left the credential file in place).
 *
 * Use webauthnCredentialsFileExists() to skip tests when the file is missing, e.g.:
 *   test.skip(!webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
 */
const test = base.extend<PasskeyAuthFromFileFixtures>({
	authenticatedPageFromPasskeyFile: async ({ browser }, use, testInfo) => {
		const credentials = readWebAuthnCredentialsFromFile();
		if (!credentials || credentials.length === 0) {
			throw new Error(CREDENTIALS_MISSING_MESSAGE);
		}

		const baseURL = testInfo.project.use.baseURL ?? 'http://localhost:4173';
		const ctx = await browser.newContext({
			baseURL,
			storageState: undefined,
			viewport: testInfo.project.use.viewport ?? { width: 1280, height: 720 },
			userAgent: testInfo.project.use.userAgent
		});

		const page = await ctx.newPage();
		const cdpSession = await ctx.newCDPSession(page);

		try {
			await cdpSession.send('WebAuthn.enable');
			const result = await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
				options: VIRTUAL_AUTHENTICATOR_OPTIONS
			});
			const authenticatorId = result?.authenticatorId ?? null;
			if (authenticatorId) {
				await cdpSession.send('WebAuthn.setAutomaticPresenceSimulation', {
					authenticatorId,
					enabled: true
				});
				for (const cred of credentials) {
					await cdpSession.send('WebAuthn.addCredential', {
						authenticatorId,
						credential: cred
					});
				}
			}

			// Login flow: /auth/login → Continue with passkey → dashboard
			await page.goto('/auth/login', { waitUntil: 'load' });
			await page.getByTestId('login-continue-passkey').click();
			await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

			await use(page);
		} finally {
			await ctx.close();
		}
	}
});

export { test, expect, CREDENTIALS_MISSING_MESSAGE };
