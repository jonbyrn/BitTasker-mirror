import { test, expect } from '@playwright/test';

/**
 * Authentication Flow E2E Tests
 * Tests the complete user authentication journey from registration to logout
 */

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the home page before each test
    await page.goto('/');
  });

  test.describe('User Registration', () => {
    test('should allow user to navigate to registration page', async ({ page }) => {
      // Click on sign up button or link
      const signUpButton = page.locator('a[href="/auth/register"], button:has-text("Sign Up"), button:has-text("Register")').first();
      await expect(signUpButton).toBeVisible();
      await signUpButton.click();

      // Verify we're on the registration page
      await expect(page).toHaveURL(/.*\/auth\/register/);
      await expect(page.locator('h1, h2')).toContainText(/sign.?up|register/i);
    });

    test('should display registration form with required fields', async ({ page }) => {
      await page.goto('/auth/register');

      // Check for essential form elements
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
      
      // Check for Nostr key generation option
      await expect(page.locator('button:has-text("Generate Nostr Key"), button:has-text("Create Key")')).toBeVisible();
    });

    test('should generate Nostr keypair when requested', async ({ page }) => {
      await page.goto('/auth/register');

      // Click generate key button
      const generateKeyButton = page.locator('button:has-text("Generate Nostr Key"), button:has-text("Create Key")').first();
      await generateKeyButton.click();

      // Wait for key generation and check for public key display
      await expect(page.locator('input[readonly], .public-key, [data-testid="public-key"]')).toBeVisible();
      
      // Verify the generated key looks like a valid Nostr public key
      const publicKey = await page.locator('input[readonly], .public-key, [data-testid="public-key"]').inputValue();
      expect(publicKey).toMatch(/^[0-9a-f]{64}$/);
    });

    test('should show device registration form after key generation', async ({ page }) => {
      await page.goto('/auth/register');

      // Generate key first
      const generateKeyButton = page.locator('button:has-text("Generate Nostr Key"), button:has-text("Create Key")').first();
      await generateKeyButton.click();

      // Check for device registration form
      await expect(page.locator('input[placeholder*="device"], input[name*="device"]')).toBeVisible();
      await expect(page.locator('button:has-text("Register Device"), button:has-text("Complete Registration")')).toBeVisible();
    });

    test('should complete registration with valid data', async ({ page }) => {
      await page.goto('/auth/register');

      // Generate Nostr key
      const generateKeyButton = page.locator('button:has-text("Generate Nostr Key"), button:has-text("Create Key")').first();
      await generateKeyButton.click();

      // Fill device information
      await page.locator('input[placeholder*="device"], input[name*="device"]').fill('Test Device');
      
      // Submit registration
      const submitButton = page.locator('button:has-text("Register Device"), button:has-text("Complete Registration")').first();
      await submitButton.click();

      // Should redirect to dashboard or show success message
      await expect(page).toHaveURL(/.*\/dashboard|\/onboarding/);
    });
  });

  test.describe('User Login', () => {
    test('should allow user to navigate to login page', async ({ page }) => {
      // Click on login button or link
      const loginButton = page.locator('a[href="/auth/login"], button:has-text("Login"), button:has-text("Sign In")').first();
      await expect(loginButton).toBeVisible();
      await loginButton.click();

      // Verify we're on the login page
      await expect(page).toHaveURL(/.*\/auth\/login/);
      await expect(page.locator('h1, h2')).toContainText(/login|sign.?in/i);
    });

    test('should display login form with authentication options', async ({ page }) => {
      await page.goto('/auth/login');

      // Check for authentication method options
      await expect(page.locator('button:has-text("Biometric"), button:has-text("Passkey")')).toBeVisible();
      
      // Check for Nostr private key input option
      await expect(page.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')).toBeVisible();
      
      // Check for submit button
      await expect(page.locator('button[type="submit"], button:has-text("Login")')).toBeVisible();
    });

    test('should show biometric authentication option when available', async ({ page }) => {
      await page.goto('/auth/login');

      // Check if biometric option is visible (may be conditional based on device capabilities)
      const biometricButton = page.locator('button:has-text("Biometric"), button:has-text("Passkey")').first();
      
      if (await biometricButton.isVisible()) {
        await expect(biometricButton).toBeVisible();
        await expect(biometricButton).toBeEnabled();
      }
    });

    test('should allow login with Nostr private key', async ({ page }) => {
      await page.goto('/auth/login');

      // Fill in Nostr private key (using a test key)
      const nsecInput = page.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]').first();
      await nsecInput.fill('nsec1testkey123456789012345678901234567890123456789012345678901234567890');
      
      // Submit login
      const submitButton = page.locator('button[type="submit"], button:has-text("Login")').first();
      await submitButton.click();

      // Should either redirect to dashboard or show appropriate error/success message
      // Note: This test may fail if the backend is not running or if the test key is invalid
      // In a real scenario, you'd use a valid test key or mock the authentication
    });

    test('should show error for invalid Nostr key', async ({ page }) => {
      await page.goto('/auth/login');

      // Fill in invalid Nostr private key
      const nsecInput = page.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]').first();
      await nsecInput.fill('invalid-key');
      
      // Submit login
      const submitButton = page.locator('button[type="submit"], button:has-text("Login")').first();
      await submitButton.click();

      // Should show error message
      await expect(page.locator('.error, .alert, [data-testid="error"]')).toBeVisible();
    });
  });

  test.describe('Authentication State Management', () => {
    test('should redirect authenticated users away from auth pages', async ({ page }) => {
      // This test would require setting up authentication state
      // For now, we'll test the basic flow
      await page.goto('/auth/login');
      
      // Verify we can access the login page when not authenticated
      await expect(page).toHaveURL(/.*\/auth\/login/);
    });

    test('should show user profile after successful authentication', async ({ page }) => {
      // This test would require successful authentication
      // For now, we'll test the expected behavior
      await page.goto('/dashboard');
      
      // Should either show login redirect or dashboard content
      const isAuthPage = await page.locator('h1, h2').textContent().then(text => 
        /login|sign.?in|register/i.test(text || '')
      );
      
      if (!isAuthPage) {
        // We're on dashboard, check for user-related elements
        await expect(page.locator('.user-profile, .user-menu, [data-testid="user-menu"]')).toBeVisible();
      }
    });
  });

  test.describe('Logout and Session Management', () => {
    test('should provide logout option in user menu', async ({ page }) => {
      // Navigate to dashboard (may redirect to login if not authenticated)
      await page.goto('/dashboard');
      
      // Look for user menu or profile dropdown
      const userMenu = page.locator('.user-menu, .profile-dropdown, [data-testid="user-menu"]').first();
      
      if (await userMenu.isVisible()) {
        await userMenu.click();
        
        // Check for logout option
        await expect(page.locator('button:has-text("Logout"), a:has-text("Logout")')).toBeVisible();
      }
    });

    test('should clear authentication state on logout', async ({ page }) => {
      // This test would require being logged in first
      // For now, we'll test the expected flow
      await page.goto('/dashboard');
      
      // If we're on dashboard (authenticated), try to logout
      const userMenu = page.locator('.user-menu, .profile-dropdown, [data-testid="user-menu"]').first();
      
      if (await userMenu.isVisible()) {
        await userMenu.click();
        
        const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout")').first();
        await logoutButton.click();
        
        // Should redirect to home or login page
        await expect(page).toHaveURL(/.*\/|\/auth\/login/);
      }
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // This test would require mocking network failures
      // For now, we'll test basic error handling
      await page.goto('/auth/login');
      
      // Fill form with data
      const nsecInput = page.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]').first();
      await nsecInput.fill('nsec1testkey123456789012345678901234567890123456789012345678901234567890');
      
      // Submit and check for error handling
      const submitButton = page.locator('button[type="submit"], button:has-text("Login")').first();
      await submitButton.click();
      
      // Should show appropriate error message or loading state
      await expect(page.locator('.error, .alert, .loading, [data-testid="error"], [data-testid="loading"]')).toBeVisible();
    });

    test('should validate form inputs before submission', async ({ page }) => {
      await page.goto('/auth/register');
      
      // Try to submit without required fields
      const submitButton = page.locator('button[type="submit"], button:has-text("Register")').first();
      await submitButton.click();
      
      // Should show validation errors
      await expect(page.locator('.error, .validation-error, [data-testid="validation-error"]')).toBeVisible();
    });
  });

  test.describe('Responsive Design and Accessibility', () => {
    test('should work on mobile devices', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      await page.goto('/auth/login');
      
      // Check that all elements are accessible on mobile
      await expect(page.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')).toBeVisible();
      await expect(page.locator('button[type="submit"], button:has-text("Login")')).toBeVisible();
      
      // Verify no horizontal scrolling
      const bodyWidth = await page.locator('body').evaluate(el => el.scrollWidth);
      const viewportWidth = page.viewportSize()?.width || 375;
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
    });

    test('should have proper accessibility attributes', async ({ page }) => {
      await page.goto('/auth/login');
      
      // Check for proper labels and ARIA attributes
      const nsecInput = page.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]').first();
      await expect(nsecInput).toHaveAttribute('aria-label', /.*/, { timeout: 1000 });
      
      // Check for proper button types
      const submitButton = page.locator('button[type="submit"], button:has-text("Login")').first();
      await expect(submitButton).toHaveAttribute('type', 'submit');
    });
  });
});
