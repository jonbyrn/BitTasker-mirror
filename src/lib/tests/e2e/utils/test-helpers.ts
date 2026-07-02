import { type Page, expect } from '@playwright/test';

/**
 * Test Helper Utilities for E2E Tests
 * Common functions to simplify test writing and maintenance
 */

export class TestHelpers {
	constructor(private page: Page) {}

	/**
	 * Wait for the page to be fully loaded
	 */
	async waitForPageLoad() {
		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Navigate to a page and wait for it to load
	 */
	async navigateTo(path: string) {
		await this.page.goto(path);
		await this.waitForPageLoad();
	}

	/**
	 * Fill a form field by label text
	 */
	async fillFieldByLabel(labelText: string, value: string) {
		const label = this.page.locator(`label:has-text("${labelText}")`);
		const input = this.page.locator(`input[id="${await label.getAttribute('for')}"]`);
		await input.fill(value);
	}

	/**
	 * Click a button by text content
	 */
	async clickButtonByText(text: string) {
		const button = this.page.locator(`button:has-text("${text}")`).first();
		await expect(button).toBeVisible();
		await button.click();
	}

	/**
	 * Click a link by text content
	 */
	async clickLinkByText(text: string) {
		const link = this.page.locator(`a:has-text("${text}")`).first();
		await expect(link).toBeVisible();
		await link.click();
	}

	/**
	 * Check if an element exists and is visible
	 */
	async elementExists(selector: string): Promise<boolean> {
		const element = this.page.locator(selector);
		return (await element.count()) > 0 && (await element.isVisible());
	}

	/**
	 * Wait for an element to appear with timeout
	 */
	async waitForElement(selector: string, timeout: number = 5000) {
		await this.page.locator(selector).waitFor({ timeout });
	}

	/**
	 * Get text content of an element
	 */
	async getText(selector: string): Promise<string> {
		const element = this.page.locator(selector);
		await expect(element).toBeVisible();
		return (await element.textContent()) || '';
	}

	/**
	 * Check if current URL matches pattern
	 */
	async expectUrl(pattern: RegExp | string) {
		if (typeof pattern === 'string') {
			await expect(this.page).toHaveURL(pattern);
		} else {
			await expect(this.page).toHaveURL(pattern);
		}
	}

	/**
	 * Check if page contains text
	 */
	async expectPageContains(text: string) {
		await expect(this.page.locator('body')).toContainText(text);
	}

	/**
	 * Check if page title matches
	 */
	async expectPageTitle(title: string | RegExp) {
		await expect(this.page).toHaveTitle(title);
	}

	/**
	 * Take a screenshot for debugging
	 */
	async takeScreenshot(name: string) {
		await this.page.screenshot({ path: `screenshots/${name}-${Date.now()}.png` });
	}

	/**
	 * Wait for network request to complete
	 */
	async waitForNetworkIdle() {
		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Check if form validation errors are visible
	 */
	async expectValidationErrors() {
		await expect(
			this.page.locator(
				'.error, .validation-error, .alert, [data-testid="error"], [data-testid="validation-error"]'
			)
		).toBeVisible();
	}

	/**
	 * Check if loading state is visible
	 */
	async expectLoadingState() {
		await expect(
			this.page.locator('.loading, .spinner, .progress, [data-testid="loading"]')
		).toBeVisible();
	}

	/**
	 * Check if success message is visible
	 */
	async expectSuccessMessage() {
		await expect(
			this.page.locator('.success, .alert-success, [data-testid="success"]')
		).toBeVisible();
	}

	/**
	 * Fill form with data object
	 */
	async fillForm(formData: Record<string, string>) {
		for (const [field, value] of Object.entries(formData)) {
			const input = this.page
				.locator(
					`input[name="${field}"], input[placeholder*="${field}"], textarea[name="${field}"]`
				)
				.first();
			if (await input.isVisible()) {
				await input.fill(value);
			}
		}
	}

	/**
	 * Submit form and wait for response
	 */
	async submitForm() {
		const submitButton = this.page.locator('button[type="submit"]').first();
		await submitButton.click();
		await this.waitForNetworkIdle();
	}

	/**
	 * Check if user is authenticated (on dashboard)
	 */
	async isAuthenticated(): Promise<boolean> {
		try {
			await this.page.goto('/hiring');
			await this.page.waitForTimeout(1000);

			// Check if we're redirected to login or if we see dashboard content
			const currentUrl = this.page.url();
			if (currentUrl.includes('/auth/login') || currentUrl.includes('/auth/register')) {
				return false;
			}

			// Look for dashboard-specific elements
			const dashboardElements = this.page.locator(
				'.dashboard, .user-menu, [data-testid="dashboard"]'
			);
			return (await dashboardElements.count()) > 0;
		} catch {
			return false;
		}
	}

	/**
	 * Login with test credentials
	 */
	async loginWithTestCredentials() {
		await this.navigateTo('/auth/login');

		// Fill in test credentials
		const nsecInput = this.page
			.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')
			.first();
		if (await nsecInput.isVisible()) {
			await nsecInput.fill(
				'nsec1testkey123456789012345678901234567890123456789012345678901234567890'
			);

			// Submit form
			await this.submitForm();

			// Wait for redirect or success
			await this.page.waitForTimeout(3000);
		}
	}

	/**
	 * Logout user
	 */
	async logout() {
		// Look for user menu
		const userMenu = this.page
			.locator('.user-menu, .profile-dropdown, [data-testid="user-menu"]')
			.first();

		if (await userMenu.isVisible()) {
			await userMenu.click();

			// Click logout
			const logoutButton = this.page
				.locator('button:has-text("Logout"), a:has-text("Logout")')
				.first();
			if (await logoutButton.isVisible()) {
				await logoutButton.click();
				await this.waitForNetworkIdle();
			}
		}
	}

	/**
	 * Generate test Nostr key
	 */
	async generateTestNostrKey() {
		await this.navigateTo('/auth/register');

		const generateKeyButton = this.page
			.locator('button:has-text("Generate Nostr Key"), button:has-text("Create Key")')
			.first();

		if (await generateKeyButton.isVisible()) {
			await generateKeyButton.click();
			await this.page.waitForTimeout(2000);

			// Return the generated public key
			const keyDisplay = this.page
				.locator('input[readonly], .public-key, [data-testid="public-key"], .nostr-key')
				.first();
			if (await keyDisplay.isVisible()) {
				return await keyDisplay.inputValue();
			}
		}

		return null;
	}

	/**
	 * Check mobile responsiveness
	 */
	async testMobileViewport() {
		await this.page.setViewportSize({ width: 375, height: 667 });

		// Check for mobile-specific elements
		const mobileMenu = this.page.locator('.mobile-menu, .hamburger, [data-testid="mobile-menu"]');
		if ((await mobileMenu.count()) > 0) {
			await expect(mobileMenu.first()).toBeVisible();
		}

		// Verify no horizontal scrolling
		const bodyWidth = await this.page.locator('body').evaluate((el) => el.scrollWidth);
		const viewportWidth = this.page.viewportSize()?.width || 375;
		expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
	}

	/**
	 * Test keyboard navigation
	 */
	async testKeyboardNavigation() {
		// Test tab navigation
		await this.page.keyboard.press('Tab');

		// Should focus on first focusable element
		const focusedElement = this.page.locator(':focus');
		await expect(focusedElement).toBeVisible();

		// Test enter key on focused element
		await this.page.keyboard.press('Enter');
	}

	/**
	 * Check accessibility features
	 */
	async checkAccessibility() {
		// Check for proper ARIA attributes
		const formInputs = this.page.locator('input, textarea, select');

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

				expect(hasLabel).toBeTruthy();
			}
		}
	}
}

/**
 * Create a test helper instance
 */
export function createTestHelper(page: Page): TestHelpers {
	return new TestHelpers(page);
}
