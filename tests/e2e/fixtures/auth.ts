import { test as base, expect } from '@playwright/test';
import { AuthHelper, createAuthHelper } from '../utils/auth-helpers';

/**
 * Extended test fixtures with authentication support.
 * Virtual authenticator is attached to the same page that runs the app.
 */

type AuthFixtures = {
	authHelper: AuthHelper;
	authenticatedPage: import('@playwright/test').Page;
};

const VIRTUAL_AUTHENTICATOR_OPTIONS = {
	protocol: 'ctap2' as const,
	ctap2Version: 'ctap2_1' as const,
	transport: 'internal' as const,
	hasResidentKey: true,
	hasUserVerification: true,
	isUserVerified: true,
	automaticPresenceSimulation: true
};

export const test = base.extend<AuthFixtures>({
	page: async ({ page }, use) => {
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
			console.log('[E2E] Virtual authenticator attached to test page');
		} catch (error) {
			console.warn('[E2E] Failed to configure virtual authenticator:', error);
		}
		await use(page);
	},

	authHelper: async ({ page }, use) => {
		const authHelper = createAuthHelper(page);
		await use(authHelper);
	},

	authenticatedPage: async (
		{ page, authHelper }: { page: import('@playwright/test').Page; authHelper: AuthHelper },
		use: (page: import('@playwright/test').Page) => Promise<void>
	) => {
		await authHelper.ensureAuthenticated('virtual');
		const isAuthenticated = await authHelper.isAuthenticated();
		if (!isAuthenticated) {
			throw new Error('Failed to authenticate user for test');
		}
		await use(page);
	}
});

export { expect };
