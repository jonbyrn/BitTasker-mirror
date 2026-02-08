import type { BrowserContext } from '@playwright/test';
import { test as authTest, expect } from './auth';
import {
	type WebAuthnCredential,
	writeWebAuthnCredentialsToFile
} from '../utils/webauthn-credentials';

/** Re-export for specs that need the type */
export type { WebAuthnCredential } from '../utils/webauthn-credentials';

/** Virtual authenticator options (same as auth fixture). */
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
 * Fixture for signup → login E2E tests. Exports WebAuthn credentials after each test
 * and injects them into the next test's authenticator so the passkey from Test 1
 * is available in Test 2 (and later tests). See plans/e2e-testing.md.
 */
const test = authTest.extend<
	object,
	{ sharedAuthContext: BrowserContext; webauthnCredentialStore: WebAuthnCredential[] }
>({
	sharedAuthContext: [
		async ({ browser }, use, testInfo) => {
			const baseURL = testInfo.project.use.baseURL ?? 'http://localhost:4173';
			const ctx = await browser.newContext({
				baseURL,
				storageState: undefined,
				viewport: testInfo.project.use.viewport ?? { width: 1280, height: 720 },
				userAgent: testInfo.project.use.userAgent
			});
			await use(ctx);
			await ctx.close();
		},
		{ scope: 'worker' }
	],

	/**
	 * Worker-scoped store for credentials exported from the previous test's authenticator.
	 * Next test's page fixture injects these into its new authenticator.
	 */
	webauthnCredentialStore: [
		async ({}, use) => {
			const store: WebAuthnCredential[] = [];
			await use(store);
		},
		{ scope: 'worker' }
	],

	/**
	 * Override page: create page from shared context, add virtual authenticator.
	 * - If store has credentials (from previous test), add them to this authenticator.
	 * - After test, export credentials from this authenticator into the store.
	 */
	page: async ({ sharedAuthContext, webauthnCredentialStore }, use) => {
		const page = await sharedAuthContext.newPage();
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
				// Inject credentials from previous test (e.g. passkey created in Test 1)
				if (webauthnCredentialStore.length > 0) {
					for (const cred of webauthnCredentialStore) {
						await cdpSession.send('WebAuthn.addCredential', {
							authenticatorId,
							credential: cred
						});
					}
					console.log('[E2E] Injected', webauthnCredentialStore.length, 'credential(s) into virtual authenticator');
				}
			}
			console.log('[E2E] Virtual authenticator attached (shared context)');
		} catch (error) {
			console.warn('[E2E] Failed to configure virtual authenticator:', error);
		}

		await use(page);

		// Export credentials so the next test can inject them (e.g. login test)
		if (authenticatorId) {
			try {
				const { credentials } = (await cdpSession.send('WebAuthn.getCredentials', {
					authenticatorId
				})) as { credentials: WebAuthnCredential[] };
				webauthnCredentialStore.length = 0;
				webauthnCredentialStore.push(...(credentials ?? []));
				if (webauthnCredentialStore.length > 0) {
					console.log('[E2E] Exported', webauthnCredentialStore.length, 'credential(s) for next test');
					// Persist to file so other spec files (e.g. wallet) can reuse via passkey-auth-from-file
					writeWebAuthnCredentialsToFile(webauthnCredentialStore);
				}
			} catch (e) {
				console.warn('[E2E] Failed to export WebAuthn credentials:', e);
			}
		}
		await page.close();
	}
});

export { test, expect };
