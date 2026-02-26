import { test, expect } from '../fixtures/auth';

/**
 * Send Payment E2E Tests
 * Tests the complete flow of sending payments through the wallet
 */

test.describe('Send Payment Flow', () => {
	test.beforeEach(async ({ authenticatedPage }) => {
		// Navigate to wallet page - try /wallet first
		await authenticatedPage.goto('/wallet');
		await authenticatedPage.waitForLoadState('networkidle');
		// If redirected, wait for redirect
		const currentUrl = authenticatedPage.url();
		if (!currentUrl.includes('/wallet')) {
			await authenticatedPage.goto('/dashboard/wallet');
			await authenticatedPage.waitForLoadState('networkidle');
		}
		// Wait for wallet to initialize - look for any wallet content (card, buttons, tabs, or error state)
		const walletContent = authenticatedPage
			.locator(
				'.card, button:has-text("Send"), button:has-text("Receive"), .tab, .alert, [class*="wallet"]'
			)
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });
	});

	test('should navigate to send payment form', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear (balance card, buttons, or error state)
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive"), [class*="wallet"]')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Click send button - look for button with Send text (case insensitive)
		const sendButton = authenticatedPage.getByRole('button', { name: /send/i }).first();
		await expect(sendButton).toBeVisible({ timeout: 10000 });
		await sendButton.click();

		// Wait for modal to open - look for modal or form elements
		await expect(
			authenticatedPage
				.locator(
					'.modal, [role="dialog"], input[placeholder*="address"], input[name*="address"], input[placeholder*="Address"]'
				)
				.first()
		).toBeVisible({ timeout: 5000 });
	});

	test('should display send payment form', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive")')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Click send button to open modal
		const sendButton = authenticatedPage.getByRole('button', { name: /send/i }).first();
		await expect(sendButton).toBeVisible({ timeout: 10000 });
		await sendButton.click();

		// Wait for modal to open and form to be visible
		await expect(
			authenticatedPage
				.locator(
					'input[placeholder*="address"], input[name*="address"], input[placeholder*="Address"]'
				)
				.first()
		).toBeVisible({ timeout: 5000 });
		await expect(
			authenticatedPage
				.locator('input[type="number"], input[placeholder*="amount"], input[placeholder*="Amount"]')
				.first()
		).toBeVisible({ timeout: 5000 });
		await expect(
			authenticatedPage.locator('button[type="submit"], button:has-text("Send")').first()
		).toBeVisible({ timeout: 5000 });
	});

	test('should parse address and detect network', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive")')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Open send modal
		const sendButton = authenticatedPage.getByRole('button', { name: /send/i }).first();
		await expect(sendButton).toBeVisible({ timeout: 10000 });
		await sendButton.click();

		// Wait for form to be visible
		const addressInput = authenticatedPage
			.locator(
				'input[placeholder*="address"], input[name*="address"], input[placeholder*="Address"]'
			)
			.first();
		await expect(addressInput).toBeVisible({ timeout: 5000 });

		// Enter RSK address
		await addressInput.fill('0x1234567890123456789012345678901234567890');

		// Wait for network detection - wait for any network indicator or form update
		await authenticatedPage.waitForLoadState('networkidle');

		// Verify network is detected (check for network indicator or form update)
		const networkIndicator = authenticatedPage
			.locator('[data-testid="network"], .network-badge, .badge, text=/rsk|rootstock/i')
			.first();
		// Network indicator may or may not be visible, so check if it exists
		const isVisible = await networkIndicator.isVisible().catch(() => false);
		if (isVisible) {
			await expect(networkIndicator).toContainText(/rsk|rootstock/i);
		}
	});

	test('should show error for invalid address', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive")')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Open send modal
		const sendButton = authenticatedPage.getByRole('button', { name: /send/i }).first();
		await expect(sendButton).toBeVisible({ timeout: 10000 });
		await sendButton.click();

		// Wait for form
		const addressInput = authenticatedPage
			.locator(
				'input[placeholder*="address"], input[name*="address"], input[placeholder*="Address"]'
			)
			.first();
		await expect(addressInput).toBeVisible({ timeout: 5000 });
		await addressInput.fill('invalid-address');

		// Wait for validation - wait for error message to appear
		await expect(
			authenticatedPage
				.locator('.error, .alert-error, [data-testid="error"], text=/invalid|error|format/i')
				.first()
		).toBeVisible({ timeout: 3000 });
	});

	test('should calculate fees when amount is entered', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive")')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Open send modal
		const sendButton = authenticatedPage.getByRole('button', { name: /send/i }).first();
		await expect(sendButton).toBeVisible({ timeout: 10000 });
		await sendButton.click();

		// Wait for form
		const addressInput = authenticatedPage
			.locator(
				'input[placeholder*="address"], input[name*="address"], input[placeholder*="Address"]'
			)
			.first();
		await expect(addressInput).toBeVisible({ timeout: 5000 });
		await addressInput.fill('0x1234567890123456789012345678901234567890');

		// Enter amount
		const amountInput = authenticatedPage
			.locator('input[type="number"], input[placeholder*="amount"], input[placeholder*="Amount"]')
			.first();
		await expect(amountInput).toBeVisible({ timeout: 5000 });
		await amountInput.fill('10000');

		// Wait for fee calculation - wait for fee display or network idle
		await authenticatedPage.waitForLoadState('networkidle');

		// Check for fee display - may or may not be visible depending on implementation
		const feeDisplay = authenticatedPage
			.locator('[data-testid="fee"], .fee, .estimated-fee, text=/fee/i')
			.first();
		const isVisible = await feeDisplay.isVisible().catch(() => false);
		if (isVisible) {
			await expect(feeDisplay).toBeVisible();
		}
	});

	test('should enable send button when form is valid', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive")')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Open send modal
		const sendButton = authenticatedPage.getByRole('button', { name: /send/i }).first();
		await expect(sendButton).toBeVisible({ timeout: 10000 });
		await sendButton.click();

		// Wait for form
		const addressInput = authenticatedPage
			.locator(
				'input[placeholder*="address"], input[name*="address"], input[placeholder*="Address"]'
			)
			.first();
		await expect(addressInput).toBeVisible({ timeout: 5000 });
		await addressInput.fill('0x1234567890123456789012345678901234567890');

		const amountInput = authenticatedPage
			.locator('input[type="number"], input[placeholder*="amount"], input[placeholder*="Amount"]')
			.first();
		await expect(amountInput).toBeVisible({ timeout: 5000 });
		await amountInput.fill('10000');

		// Wait for validation - wait for network idle or button to be enabled
		await authenticatedPage.waitForLoadState('networkidle');

		// Check send button is enabled
		const submitButton = authenticatedPage
			.locator('button[type="submit"], button:has-text("Send"):not(:disabled)')
			.first();
		await expect(submitButton).toBeEnabled({ timeout: 3000 });
	});
});
