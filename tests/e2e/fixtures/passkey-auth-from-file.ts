import { test as base, expect } from '@playwright/test';
import {
	readCredentialSet,
	webauthnCredentialsFileExists,
	getCredentialSetLabels
} from '../utils/webauthn-credentials';

/** Re-export so specs can skip when file is missing or pick a user */
export { webauthnCredentialsFileExists, getCredentialSetLabels };

const CREDENTIALS_MISSING_MESSAGE =
	'WebAuthn credentials file not found. Run 01-signup-onboarding.spec.ts first to generate tests/e2e/.auth/webauthn-credentials.json';

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
	/** Which credential set to use ('signup' | 'nostr' | etc.). Default 'signup'. */
	credentialLabel: string;
	authenticatedPageFromPasskeyFile: import('@playwright/test').Page;
};

/**
 * Fixture for specs that reuse passkeys from the credentials file.
 * Use credentialLabel to pick a user (e.g. 'signup', 'nostr'). Default is 'signup'.
 *
 * Skip when file is missing; use a function so the condition runs at runtime (after 01 runs):
 *   test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
 */
const CHROMIUM_ONLY_MESSAGE =
	'Passkey auth uses CDP/WebAuthn virtual authenticators, which are only available in Chromium.';

const test = base.extend<PasskeyAuthFromFileFixtures>({
	credentialLabel: ['signup', { option: true }],

	authenticatedPageFromPasskeyFile: async ({ browser, credentialLabel }, use, testInfo) => {
		if (browser.browserType().name() !== 'chromium') {
			testInfo.skip(true, CHROMIUM_ONLY_MESSAGE);
			const baseURL = testInfo.project.use.baseURL ?? 'http://localhost:4173';
			const ctx = await browser.newContext({
				baseURL,
				storageState: undefined,
				viewport: testInfo.project.use.viewport ?? { width: 1280, height: 720 }
			});
			const page = await ctx.newPage();
			await use(page);
			await ctx.close();
			return;
		}

		const credentials = readCredentialSet(credentialLabel);
		if (!credentials || credentials.length === 0) {
			const availableLabels = getCredentialSetLabels();
			throw new Error(
				`${CREDENTIALS_MISSING_MESSAGE} (requested label: ${credentialLabel}; available labels: ${
					availableLabels.length > 0 ? availableLabels.join(', ') : 'none'
				})`
			);
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

			await page.goto('/auth/login', { waitUntil: 'load' });
			await page.getByTestId('login-continue-passkey').click();
			await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

			// Dismiss Beta Warning modal so it doesn't block navigations (e.g. messages, wallet)
			const understandBtn = page.getByRole('button', {
				name: 'I understand',
				exact: true
			});
			await understandBtn.click({ timeout: 5_000 }).catch(() => {});

			await use(page);
		} finally {
			await ctx.close();
		}
	}
});

export { test, expect, CREDENTIALS_MISSING_MESSAGE };
