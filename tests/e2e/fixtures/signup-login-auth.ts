import { test as authTest, expect } from './auth';
import {
	type WebAuthnCredential,
	readCredentialSet,
	writeCredentialSet
} from '../utils/webauthn-credentials';

export type { WebAuthnCredential } from '../utils/webauthn-credentials';

const VIRTUAL_AUTHENTICATOR_OPTIONS = {
	protocol: 'ctap2' as const,
	ctap2Version: 'ctap2_1' as const,
	transport: 'internal' as const,
	hasResidentKey: true,
	hasUserVerification: true,
	isUserVerified: true,
	automaticPresenceSimulation: true
};

/**
 * Fixture for signup/onboarding E2E tests with explicit credential injection control.
 *
 * - injectWebAuthnCredentials (default false): Set to true via test.use() to inject credentials.
 * - credentialExportLabel (default 'signup'): Label used for reading/writing credential sets.
 * - Uses default context (new per test) so each test gets fresh storage; no shared auth state.
 * - Teardown exports credentials to worker store and file using credentialExportLabel.
 *
 * Example:
 *   test('signup...', async ({ page }) => { ... });           // no injection
 *   test.use({ injectWebAuthnCredentials: true });
 *   test('login with passkey', async ({ page }) => { ... });   // injects from store/file
 */
const test = authTest.extend<
	{ injectWebAuthnCredentials: boolean; credentialExportLabel: string },
	{ webauthnCredentialStore: WebAuthnCredential[] }
>({
	injectWebAuthnCredentials: [false, { option: true }],
	credentialExportLabel: ['signup', { option: true }],

	webauthnCredentialStore: [
		// eslint-disable-next-line no-empty-pattern -- worker fixture has no dependencies
		async ({}, use) => {
			const store: WebAuthnCredential[] = [];
			await use(store);
		},
		{ scope: 'worker' }
	],

	page: async (
		{ context, webauthnCredentialStore, injectWebAuthnCredentials, credentialExportLabel },
		use,
		testInfo
	) => {
		// Use default context (new per test) so each test gets fresh storage – no shared auth state.
		const page = await context.newPage();

		// CDP/WebAuthn virtual authenticators only work in Chromium
		const browser = context.browser();
		if (!browser || browser.browserType().name() !== 'chromium') {
			testInfo.skip(true, 'Signup/onboarding tests require Chromium (CDP for WebAuthn)');
			await use(page);
			await page.close();
			return;
		}

		const cdpSession = await page.context().newCDPSession(page);
		let authenticatorId: string | null = null;

		try {
			await cdpSession.send('WebAuthn.enable');
			const result = await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
				options: VIRTUAL_AUTHENTICATOR_OPTIONS
			});
			authenticatorId = result?.authenticatorId ?? null;
			if (authenticatorId) {
				await cdpSession.send('WebAuthn.setAutomaticPresenceSimulation', {
					authenticatorId,
					enabled: true
				});
				// Only inject when explicitly opted in.
				if (injectWebAuthnCredentials) {
					const toInject = readCredentialSet(credentialExportLabel) ?? webauthnCredentialStore;
					if (toInject.length > 0) {
						for (const cred of toInject) {
							await cdpSession.send('WebAuthn.addCredential', {
								authenticatorId,
								credential: cred
							});
						}
						console.log(
							'[E2E] Injected',
							toInject.length,
							'credential(s) (injectWebAuthnCredentials=true)'
						);
					}
				}
			}
			console.log('[E2E] Virtual authenticator attached (inject=', injectWebAuthnCredentials, ')');
		} catch (error) {
			console.warn('[E2E] Failed to configure virtual authenticator:', error);
		}

		await use(page);

		if (authenticatorId) {
			try {
				const { credentials } = (await cdpSession.send('WebAuthn.getCredentials', {
					authenticatorId
				})) as { credentials: WebAuthnCredential[] };
				webauthnCredentialStore.length = 0;
				webauthnCredentialStore.push(...(credentials ?? []));
				if (webauthnCredentialStore.length > 0) {
					writeCredentialSet(credentialExportLabel, webauthnCredentialStore);
					console.log(
						'[E2E] Exported',
						webauthnCredentialStore.length,
						'credential(s) (label:',
						credentialExportLabel,
						')'
					);
				}
			} catch (e) {
				console.warn('[E2E] Failed to export WebAuthn credentials:', e);
			}
		}
		await page.close();
	}
});

export { test, expect };
