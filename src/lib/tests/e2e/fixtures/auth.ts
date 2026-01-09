import { test as base, expect, chromium } from '@playwright/test';
import { AuthHelper, createAuthHelper } from '../utils/auth-helpers';

/**
 * Extended test fixtures with authentication support
 */

type AuthFixtures = {
  authHelper: AuthHelper;
  authenticatedPage: any; // Page with authentication already set up
};

export const test = base.extend<AuthFixtures>({
  /**
   * Override context to configure virtual authenticator before any pages are created
   * This ensures WebAuthn is available when the page loads
   */
  context: async ({ browser }, use) => {
    // Get the default context or create a new one
    const context = await browser.newContext();
    
    // Create a temporary page to establish CDP connection
    const tempPage = await context.newPage();
    const cdpSession = await context.newCDPSession(tempPage);
    
    try {
      // Enable WebAuthn and add virtual authenticator BEFORE any real pages are created
      await cdpSession.send('WebAuthn.enable');
      const authenticatorResponse = await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
        options: {
          protocol: 'ctap2',
          ctap2Version: 'ctap2_1',
          transport: 'internal', // Use 'internal' for platform authenticator - matches authenticatorAttachment: 'platform'
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true
        }
      });
      
      // Ensure automatic presence simulation is enabled
      if (authenticatorResponse.authenticatorId) {
        await cdpSession.send('WebAuthn.setAutomaticPresenceSimulation', {
          authenticatorId: authenticatorResponse.authenticatorId,
          enabled: true
        });
      }
      
      console.log('[E2E] Virtual authenticator configured in context');
    } catch (error) {
      console.warn('[E2E] Failed to configure virtual authenticator:', error);
      // Continue anyway - tests can still use Nostr key login
    } finally {
      // Close temp page, but keep context with authenticator configured
      await tempPage.close();
    }
    
    await use(context);
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
  authenticatedPage: async ({ page, authHelper }, use) => {
    // Ensure user is authenticated
    await authHelper.ensureAuthenticated('virtual');

    // Verify authentication
    const isAuthenticated = await authHelper.isAuthenticated();
    if (!isAuthenticated) {
      throw new Error('Failed to authenticate user for test');
    }

    // Use the authenticated page
    await use(page);
  },
});

export { expect };




