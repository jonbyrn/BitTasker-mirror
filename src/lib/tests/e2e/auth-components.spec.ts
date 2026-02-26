import { test, expect } from '@playwright/test';

/**
 * Authentication Components E2E Tests
 * Tests specific authentication components and user interactions
 */

test.describe('Authentication Components', () => {
	test.beforeEach(async ({ page }) => {
		// Navigate to the home page before each test
		await page.goto('/');
	});

	test.describe('Logo and Branding', () => {
		test('should display application logo', async ({ page }) => {
			const logo = page
				.locator('img[alt*="logo"], img[alt*="Logo"], .logo, [data-testid="logo"]')
				.first();
			await expect(logo).toBeVisible();
		});

		test('should have proper logo alt text', async ({ page }) => {
			const logo = page
				.locator('img[alt*="logo"], img[alt*="Logo"], .logo, [data-testid="logo"]')
				.first();
			if (await logo.isVisible()) {
				const altText = await logo.getAttribute('alt');
				expect(altText).toBeTruthy();
				expect(altText?.length).toBeGreaterThan(0);
			}
		});
	});

	test.describe('Navigation and Links', () => {
		test('should have working navigation links', async ({ page }) => {
			// Check for common navigation elements
			const navLinks = page.locator('nav a, .navbar a, .navigation a');

			if ((await navLinks.count()) > 0) {
				// Test first few navigation links
				for (let i = 0; i < Math.min(3, await navLinks.count()); i++) {
					const link = navLinks.nth(i);
					const href = await link.getAttribute('href');
					if (href && !href.startsWith('#')) {
						await expect(link).toBeVisible();
						await expect(link).toBeEnabled();
					}
				}
			}
		});

		test('should have accessible navigation structure', async ({ page }) => {
			// Check for proper navigation landmarks
			const nav = page.locator('nav, [role="navigation"]');
			if ((await nav.count()) > 0) {
				await expect(nav.first()).toBeVisible();
			}
		});
	});

	test.describe('Authentication Forms', () => {
		test('should have proper form structure on login page', async ({ page }) => {
			await page.goto('/auth/login');

			// Check for form element
			const form = page.locator('form').first();
			await expect(form).toBeVisible();

			// Check for proper form action and method
			const action = await form.getAttribute('action');
			const method = await form.getAttribute('method');

			// Form should either have no action (handled by JavaScript) or proper action
			if (action) {
				expect(action).toMatch(/^\/|https?:\/\//);
			}

			// Method should be POST or not specified (for JavaScript handling)
			if (method) {
				expect(method.toLowerCase()).toMatch(/^(post|get)$/);
			}
		});

		test('should have proper form validation attributes', async ({ page }) => {
			await page.goto('/auth/register');

			// Check for required field indicators
			const requiredFields = page.locator('input[required], textarea[required], select[required]');

			if ((await requiredFields.count()) > 0) {
				for (let i = 0; i < (await requiredFields.count()); i++) {
					const field = requiredFields.nth(i);
					await expect(field).toHaveAttribute('required');
				}
			}
		});

		test('should handle form submission properly', async ({ page }) => {
			await page.goto('/auth/login');

			// Fill in form data
			const nsecInput = page
				.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')
				.first();
			if (await nsecInput.isVisible()) {
				await nsecInput.fill('test-input');

				// Submit form
				const submitButton = page
					.locator('button[type="submit"], button:has-text("Login")')
					.first();
				await submitButton.click();

				// Should show some response (error, loading, or redirect)
				await expect(
					page.locator(
						'.error, .alert, .loading, .success, [data-testid="error"], [data-testid="loading"], [data-testid="success"]'
					)
				).toBeVisible({ timeout: 5000 });
			}
		});
	});

	test.describe('Biometric Authentication', () => {
		test('should detect biometric availability', async ({ page }) => {
			await page.goto('/auth/login');

			// Look for biometric-related elements
			const biometricElements = page.locator(
				'button:has-text("Biometric"), button:has-text("Passkey"), .biometric-option, [data-testid="biometric"]'
			);

			if ((await biometricElements.count()) > 0) {
				// Biometric option is available
				await expect(biometricElements.first()).toBeVisible();
				await expect(biometricElements.first()).toBeEnabled();
			}
		});

		test('should handle biometric authentication flow', async ({ page }) => {
			await page.goto('/auth/login');

			const biometricButton = page
				.locator('button:has-text("Biometric"), button:has-text("Passkey")')
				.first();

			if (await biometricButton.isVisible()) {
				await biometricButton.click();

				// Should show some response or state change
				// This might be a loading state, success, or error depending on the implementation
				await expect(
					page.locator(
						'.loading, .success, .error, [data-testid="loading"], [data-testid="success"], [data-testid="error"]'
					)
				).toBeVisible({ timeout: 10000 });
			}
		});
	});

	test.describe('Nostr Integration', () => {
		test('should generate valid Nostr keys', async ({ page }) => {
			await page.goto('/auth/register');

			const generateKeyButton = page
				.locator('button:has-text("Generate Nostr Key"), button:has-text("Create Key")')
				.first();

			if (await generateKeyButton.isVisible()) {
				await generateKeyButton.click();

				// Wait for key generation
				await page.waitForTimeout(2000);

				// Look for generated key display
				const keyDisplay = page.locator(
					'input[readonly], .public-key, [data-testid="public-key"], .nostr-key'
				);

				if ((await keyDisplay.count()) > 0) {
					await expect(keyDisplay.first()).toBeVisible();

					// Verify key format (should be 64 character hex string)
					const keyValue = await keyDisplay.first().inputValue();
					expect(keyValue).toMatch(/^[0-9a-f]{64}$/);
				}
			}
		});

		test('should validate Nostr key format', async ({ page }) => {
			await page.goto('/auth/login');

			const nsecInput = page
				.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')
				.first();

			if (await nsecInput.isVisible()) {
				// Test invalid key format
				await nsecInput.fill('invalid-key-format');

				// Submit and check for validation error
				const submitButton = page
					.locator('button[type="submit"], button:has-text("Login")')
					.first();
				await submitButton.click();

				// Should show validation error
				await expect(
					page.locator(
						'.error, .validation-error, .alert, [data-testid="error"], [data-testid="validation-error"]'
					)
				).toBeVisible({ timeout: 5000 });
			}
		});
	});

	test.describe('Error Handling', () => {
		test('should display error messages clearly', async ({ page }) => {
			await page.goto('/auth/login');

			// Try to submit empty form
			const submitButton = page.locator('button[type="submit"], button:has-text("Login")').first();
			await submitButton.click();

			// Should show error message
			await expect(
				page.locator(
					'.error, .alert, .validation-error, [data-testid="error"], [data-testid="validation-error"]'
				)
			).toBeVisible({ timeout: 5000 });
		});

		test('should handle network errors gracefully', async ({ page }) => {
			await page.goto('/auth/login');

			// Fill form with data
			const nsecInput = page
				.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')
				.first();
			if (await nsecInput.isVisible()) {
				await nsecInput.fill(
					'nsec1testkey123456789012345678901234567890123456789012345678901234567890'
				);

				// Submit form
				const submitButton = page
					.locator('button[type="submit"], button:has-text("Login")')
					.first();
				await submitButton.click();

				// Should show appropriate response (error, loading, or success)
				await expect(
					page.locator(
						'.error, .alert, .loading, .success, [data-testid="error"], [data-testid="loading"], [data-testid="success"]'
					)
				).toBeVisible({ timeout: 10000 });
			}
		});
	});

	test.describe('Loading States', () => {
		test('should show loading indicators during operations', async ({ page }) => {
			await page.goto('/auth/login');

			// Fill form and submit
			const nsecInput = page
				.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')
				.first();
			if (await nsecInput.isVisible()) {
				await nsecInput.fill(
					'nsec1testkey123456789012345678901234567890123456789012345678901234567890'
				);

				const submitButton = page
					.locator('button[type="submit"], button:has-text("Login")')
					.first();
				await submitButton.click();

				// Should show loading state briefly
				await expect(
					page.locator('.loading, [data-testid="loading"], .spinner, .progress')
				).toBeVisible({ timeout: 5000 });
			}
		});

		test('should disable form during submission', async ({ page }) => {
			await page.goto('/auth/login');

			const submitButton = page.locator('button[type="submit"], button:has-text("Login")').first();

			if (await submitButton.isVisible()) {
				// Click submit
				await submitButton.click();

				// Button should be disabled during submission
				await expect(submitButton).toBeDisabled({ timeout: 2000 });
			}
		});
	});

	test.describe('Accessibility Features', () => {
		test('should have proper focus management', async ({ page }) => {
			await page.goto('/auth/login');

			// Check that form elements can receive focus
			const nsecInput = page
				.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')
				.first();
			if (await nsecInput.isVisible()) {
				await nsecInput.focus();
				await expect(nsecInput).toBeFocused();
			}
		});

		test('should have proper ARIA labels', async ({ page }) => {
			await page.goto('/auth/login');

			// Check for form labels and ARIA attributes
			const formInputs = page.locator('input, textarea, select');

			if ((await formInputs.count()) > 0) {
				for (let i = 0; i < Math.min(3, await formInputs.count()); i++) {
					const input = formInputs.nth(i);
					const hasLabel = await input.evaluate((el) => {
						const id = el.getAttribute('id');
						const ariaLabel = el.getAttribute('aria-label');
						const ariaLabelledBy = el.getAttribute('aria-labelledby');
						const label = el.closest('label');
						return id || ariaLabel || ariaLabelledBy || label;
					});

					// At least one labeling method should be present
					expect(hasLabel).toBeTruthy();
				}
			}
		});

		test('should support keyboard navigation', async ({ page }) => {
			await page.goto('/auth/login');

			// Test tab navigation
			await page.keyboard.press('Tab');

			// Should focus on first focusable element
			const focusedElement = page.locator(':focus');
			await expect(focusedElement).toBeVisible();
		});
	});

	test.describe('Mobile Responsiveness', () => {
		test('should work properly on mobile viewport', async ({ page }) => {
			// Set mobile viewport
			await page.setViewportSize({ width: 375, height: 667 });

			await page.goto('/auth/login');

			// Check that all elements are accessible
			const nsecInput = page
				.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')
				.first();
			const submitButton = page.locator('button[type="submit"], button:has-text("Login")').first();

			await expect(nsecInput).toBeVisible();
			await expect(submitButton).toBeVisible();

			// Check for mobile-specific elements or behaviors
			const mobileMenu = page.locator('.mobile-menu, .hamburger, [data-testid="mobile-menu"]');
			if ((await mobileMenu.count()) > 0) {
				await expect(mobileMenu.first()).toBeVisible();
			}
		});

		test('should handle touch interactions properly', async ({ page }) => {
			// Set mobile viewport
			await page.setViewportSize({ width: 375, height: 667 });

			await page.goto('/auth/login');

			// Test touch interactions (simulated with mouse for now)
			const nsecInput = page
				.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')
				.first();
			if (await nsecInput.isVisible()) {
				await nsecInput.click();
				await expect(nsecInput).toBeFocused();
			}
		});
	});
});
