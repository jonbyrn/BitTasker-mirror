/**
 * Setup script for E2E test authentication
 * 
 * This script helps create and save authentication state for E2E tests.
 * Run this once to authenticate and save the session, then tests can reuse it.
 * 
 * Usage:
 *   npx ts-node tests/e2e/scripts/setup-auth.ts
 *   or
 *   npm run test:e2e:setup-auth
 */

import { chromium } from '@playwright/test';
import { AuthHelper, createAuthHelper } from '../utils/auth-helpers';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupAuth() {
  console.log('🚀 Starting authentication setup...\n');

  // Launch browser with virtual authenticator support
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  
  // Create a temporary page JUST for CDP setup (before any real navigation)
  // This ensures the virtual authenticator is configured at the context level
  const tempPage = await context.newPage();
  const cdpSession = await context.newCDPSession(tempPage);
  
  try {
    // Enable WebAuthn and add virtual authenticator BEFORE any real pages are created
      await cdpSession.send('WebAuthn.enable');
    // Add virtual authenticator with 'internal' transport (platform authenticator)
    // This should take precedence over real hardware keys when properly configured
    const authenticatorResponse = await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        ctap2Version: 'ctap2_1',
        transport: 'internal', // Platform authenticator - should work with permissive authenticatorSelection
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
    
    console.log('✅ WebAuthn virtual authenticator configured at context level');
    console.log('   Authenticator ID:', authenticatorResponse.authenticatorId);
    console.log('   Note: If you see hardware key prompts, the virtual authenticator may not be recognized.\n');
  } catch (error) {
    console.warn('⚠️  Failed to configure virtual authenticator:', error);
    // Continue anyway - tests can still use Nostr key login
  } finally {
    // Close temp page - authenticator persists in context
    await tempPage.close();
  }
  
  // NOW create the actual page that will navigate
  // Virtual authenticator is already configured in the context
  const page = await context.newPage();
  
  // Mock Capacitor BEFORE page loads and inject Playwright test flag
  await page.addInitScript(() => {
    // Mark as Playwright test environment
    (window as any).__PLAYWRIGHT_TEST__ = true;
    
    if (!(window as any).Capacitor) {
      (window as any).Capacitor = {
        isNativePlatform: () => false,
        getPlatform: () => 'web',
        Plugins: {
          NativeBiometric: {
            isAvailable: async () => ({ isAvailable: false, biometryType: null }),
            verifyIdentity: async () => { throw new Error('Not available in browser'); },
            setCredentials: async () => {},
            getCredentials: async () => { throw new Error('Not available in browser'); },
            deleteCredentials: async () => {}
          }
        }
      };
    }
  });

  const authHelper = createAuthHelper(page);

  try {
    // Check if auth state already exists
    if (AuthHelper.authStateExists()) {
      console.log('⚠️  Authentication state already exists.');
      console.log('   File:', path.join(__dirname, '../.auth/test-user.json'));
      console.log('   Delete it first if you want to create a new one.\n');
      
      // Try to load and verify
      const loaded = await authHelper.loadAuthState();
      if (loaded) {
        const isAuth = await authHelper.isAuthenticated();
        if (isAuth) {
          console.log('✅ Existing auth state is valid. No action needed.');
          await browser.close();
          return;
        } else {
          console.log('❌ Existing auth state is expired. Creating new one...\n');
        }
      }
    }

    console.log('📝 Instructions:');
    console.log('   1. A browser window will open');
    console.log('   2. IMPORTANT: If you see a hardware security key prompt:');
    console.log('      * The browser may be detecting your real hardware key');
    console.log('      * Try unplugging/disabling your hardware security key temporarily');
    console.log('      * Or use Nostr private key login instead (see below)');
    console.log('   3. Alternative: Use Nostr private key login:');
    console.log('      * Look for "Login with Nostr Key" or "Nostr Key" button');
    console.log('      * Enter your Nostr private key (starts with nsec1...)');
    console.log('      * If you don\'t have a key, register a new account first');
    console.log('        and save the generated Nostr key');
    console.log('   4. Once authenticated and redirected to dashboard, the session will be saved\n');
    console.log('💡 Note: Virtual authenticator is configured, but browsers may prioritize real hardware keys.');
    console.log('   If you see hardware key prompts, temporarily disable/unplug your hardware key.\n');

    // Navigate to login page
    await page.goto('http://localhost:3000/auth/login');
    console.log('🌐 Browser opened. Please complete authentication...\n');
    console.log('⏳ Waiting for you to authenticate (you have 5 minutes)...\n');
    console.log('📌 IMPORTANT: Use Nostr key login, not biometric (biometric won\'t work in browser)\n');

    // Wait for user to authenticate (check for dashboard or onboarding redirect)
    // Also check for any error messages about biometric
    try {
      // Wait for either dashboard or onboarding (new users go to onboarding)
      await page.waitForURL(/.*\/(dashboard|auth\/onboarding)/, { timeout: 300000 }); // 5 minute timeout
      console.log('✅ Redirected to:', page.url());
    } catch (error) {
      // Check if there's a biometric error message visible
      const biometricError = await page.locator('text=/biometric.*not.*available/i').isVisible().catch(() => false);
      if (biometricError) {
        console.error('\n❌ Biometric authentication error detected!');
        console.log('\n💡 Solution: Use Nostr key login instead:');
        console.log('   1. Look for "Login with Nostr Key" or similar button');
        console.log('   2. Enter your Nostr private key (nsec1...)');
        console.log('   3. If you don\'t have a key, register a new account first\n');
      }
      throw error;
    }

    // Verify authentication
    const isAuthenticated = await authHelper.isAuthenticated();
    if (!isAuthenticated) {
      throw new Error('Authentication verification failed');
    }

    // Save auth state
    await authHelper.saveAuthState();
    console.log('\n✅ Authentication state saved successfully!');
    console.log('   File:', path.join(__dirname, '../.auth/test-user.json'));
    console.log('\n📌 You can now run E2E tests that require authentication.');

  } catch (error) {
    console.error('\n❌ Authentication setup failed:', error);
    console.log('\n💡 Tips:');
    console.log('   - Make sure the dev server is running (npm run dev)');
    console.log('   - Complete the full authentication flow');
    console.log('   - Check that you can access /dashboard manually');
    process.exit(1);
  } finally {
    // Keep browser open for a moment so user can see the result
    await page.waitForTimeout(2000);
    await browser.close();
  }
}

// Run setup
setupAuth().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});




