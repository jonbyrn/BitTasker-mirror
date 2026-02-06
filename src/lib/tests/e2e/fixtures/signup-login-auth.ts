import type { BrowserContext } from '@playwright/test';
import { test as authTest, expect } from './auth';

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
 * Fixture for signup → login E2E tests that share the same browser context.
 *
 * Worker-scoped sharedAuthContext: Both tests use the same context, so the passkey
 * created in the first test is available to the second. Tests must run serially.
 */
const test = authTest.extend<object, { sharedAuthContext: BrowserContext }>({
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
	 * Override page to use sharedAuthContext instead of default context.
	 * Each test gets a new page from the shared context, with authenticator attached.
	 */
	page: async ({ sharedAuthContext }, use) => {
		const page = await sharedAuthContext.newPage();
		const cdpSession = await page.context().newCDPSession(page);
		try {
			await cdpSession.send('WebAuthn.enable');
			const result = await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
				options: VIRTUAL_AUTHENTICATOR_OPTIONS
			});
			if (result?.authenticatorId) {
				await cdpSession.send('WebAuthn.setAutomaticPresenceSimulation', {
					authenticatorId: result.authenticatorId,
					enabled: true
				});
			}
			console.log('[E2E] Virtual authenticator attached (shared context)');
		} catch (error) {
			console.warn('[E2E] Failed to configure virtual authenticator:', error);
		}
		await use(page);
		await page.close();
	}
});

export { test, expect };
