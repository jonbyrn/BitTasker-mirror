import { test as base, expect } from '@playwright/test';
import { AuthHelper, createAuthHelper } from '../utils/auth-helpers';

/**
 * Extended test fixtures with authentication support.
 *
 * Virtual authenticator: We attach the CDP WebAuthn virtual authenticator to the **same page**
 * that the test uses. CDP virtual authenticators are bound to the frame/target; attaching
 * to a temporary page and then closing it leaves the test page without an authenticator,
 * so credentials.create() would hang or fail. See requirements/details/authentication-flow.md
 * and plans/e2e-signup-onboarding-plan.md.
 */

type AuthFixtures = {
  authHelper: AuthHelper;
  authenticatedPage: any; // Page with authentication already set up
};

/** Virtual authenticator options matching app's test-mode WebAuthn creation (resident key, user verification). */
const VIRTUAL_AUTHENTICATOR_OPTIONS = {
  protocol: 'ctap2' as const,
  ctap2Version: 'ctap2_1' as const,
  transport: 'internal' as const, // platform authenticator
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
};

export const test = base.extend<AuthFixtures>({
  /**
   * Override page to attach the WebAuthn virtual authenticator to **this** page.
   * The authenticator must be on the same page/frame that runs the app and calls
   * navigator.credentials.create(); attaching to a temp page and closing it
   * does not work (authenticator is tied to that target).
   */
  page: async ({ page }, use) => {
    const cdpSession = await page.context().newCDPSession(page);
    try {
      await cdpSession.send('WebAuthn.enable');
      const result = await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
        options: VIRTUAL_AUTHENTICATOR_OPTIONS,
      });
      if (result?.authenticatorId) {
        await cdpSession.send('WebAuthn.setAutomaticPresenceSimulation', {
          authenticatorId: result.authenticatorId,
          enabled: true,
        });
      }
      console.log('[E2E] Virtual authenticator attached to test page');
    } catch (error) {
      console.warn('[E2E] Failed to configure virtual authenticator:', error);
    }
    await use(page);
  },

  /**
   * Auth helper instance for managing authentication
   */
  authHelper: async ({ page }, use) => {
    const authHelper = createAuthHelper(page);
    await use(authHelper);
  },

  /**
   * Page fixture that automatically authenticates before tests
   * Uses saved auth state if available, otherwise authenticates using virtual passkey
   */
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
  },
});

export { expect };
