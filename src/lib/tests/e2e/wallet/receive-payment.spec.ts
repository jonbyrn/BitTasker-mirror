import { test, expect } from '../fixtures/auth';

/**
 * Receive Payment E2E Tests
 * Tests the complete flow of receiving payments through the wallet
 */

test.describe('Receive Payment Flow', () => {
	test.beforeEach(async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/wallet');
		await authenticatedPage.waitForLoadState('networkidle');
		// Wait for wallet to initialize - look for any wallet content (card, buttons, tabs, or error state)
		const walletContent = authenticatedPage
			.locator(
				'.card, button:has-text("Send"), button:has-text("Receive"), .tab, .alert, [class*="wallet"]'
			)
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });
	});

	test('should navigate to receive payment form', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive")')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Click receive button - look for button with Receive text (case insensitive)
		const receiveButton = authenticatedPage.getByRole('button', { name: /receive/i }).first();
		await expect(receiveButton).toBeVisible({ timeout: 10000 });
		await receiveButton.click();

		// Wait for modal to open - look for modal or form elements
		await expect(
			authenticatedPage
				.locator(
					'.modal, [role="dialog"], input[type="number"], input[placeholder*="amount"], input[placeholder*="Amount"]'
				)
				.first()
		).toBeVisible({ timeout: 5000 });
	});

	test('should display receive payment form', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive")')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Click receive button to open modal
		const receiveButton = authenticatedPage.getByRole('button', { name: /receive/i }).first();
		await expect(receiveButton).toBeVisible({ timeout: 10000 });
		await receiveButton.click();

		// Wait for form to be visible
		await expect(
			authenticatedPage
				.locator('input[type="number"], input[placeholder*="amount"], input[placeholder*="Amount"]')
				.first()
		).toBeVisible({ timeout: 5000 });
		// Network selector may be a select or details element (DaisyUI dropdown)
		const networkSelector = authenticatedPage
			.locator('select, [role="combobox"], details summary')
			.first();
		await expect(networkSelector).toBeVisible({ timeout: 5000 });
	});

	test('should generate invoice when amount is entered', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive")')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Open receive modal
		const receiveButton = authenticatedPage.getByRole('button', { name: /receive/i }).first();
		await expect(receiveButton).toBeVisible({ timeout: 10000 });
		await receiveButton.click();

		// Wait for form
		const amountInput = authenticatedPage
			.locator('input[type="number"], input[placeholder*="amount"], input[placeholder*="Amount"]')
			.first();
		await expect(amountInput).toBeVisible({ timeout: 5000 });
		await amountInput.fill('10000');

		// Wait for invoice generation to be triggered (may happen automatically or via button)
		await authenticatedPage.waitForLoadState('networkidle');

		// Look for generate button or wait for invoice/QR code
		const generateButton = authenticatedPage
			.locator('button:has-text("Generate"), button:has-text("Create")')
			.first();
		const hasGenerateButton = await generateButton.isVisible().catch(() => false);

		if (hasGenerateButton) {
			await generateButton.click();
			await authenticatedPage.waitForLoadState('networkidle');
		}

		// Should show QR code or invoice - wait for it to appear
		const qrCode = authenticatedPage
			.locator('img[alt*="QR"], canvas, svg, [data-testid="qr-code"]')
			.first();
		await expect(qrCode).toBeVisible({ timeout: 10000 });
	});

	test('should display QR code for generated invoice', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive")')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Open receive modal
		const receiveButton = authenticatedPage.getByRole('button', { name: /receive/i }).first();
		await expect(receiveButton).toBeVisible({ timeout: 10000 });
		await receiveButton.click();

		// Wait for form
		const amountInput = authenticatedPage
			.locator('input[type="number"], input[placeholder*="amount"], input[placeholder*="Amount"]')
			.first();
		await expect(amountInput).toBeVisible({ timeout: 5000 });
		await amountInput.fill('50000');

		// Wait for invoice generation
		await authenticatedPage.waitForLoadState('networkidle');

		// Look for generate button
		const generateButton = authenticatedPage
			.locator('button:has-text("Generate"), button:has-text("Create")')
			.first();
		const hasGenerateButton = await generateButton.isVisible().catch(() => false);

		if (hasGenerateButton) {
			await generateButton.click();
			await authenticatedPage.waitForLoadState('networkidle');
		}

		// QR code should be visible
		const qrCode = authenticatedPage
			.locator('img[alt*="QR"], canvas, svg, [data-testid="qr-code"]')
			.first();
		await expect(qrCode).toBeVisible({ timeout: 10000 });
	});

	test('should allow copying invoice address', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive")')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Open receive modal
		const receiveButton = authenticatedPage.getByRole('button', { name: /receive/i }).first();
		await expect(receiveButton).toBeVisible({ timeout: 10000 });
		await receiveButton.click();

		// Wait for form
		const amountInput = authenticatedPage
			.locator('input[type="number"], input[placeholder*="amount"], input[placeholder*="Amount"]')
			.first();
		await expect(amountInput).toBeVisible({ timeout: 5000 });
		await amountInput.fill('10000');

		// Wait for invoice generation
		await authenticatedPage.waitForLoadState('networkidle');

		// Look for generate button
		const generateButton = authenticatedPage
			.locator('button:has-text("Generate"), button:has-text("Create")')
			.first();
		const hasGenerateButton = await generateButton.isVisible().catch(() => false);

		if (hasGenerateButton) {
			await generateButton.click();
			await authenticatedPage.waitForLoadState('networkidle');
		}

		// Find copy button - wait for it to appear
		const copyButton = authenticatedPage
			.locator('button:has-text("Copy"), button[aria-label*="copy"], button:has([class*="copy"])')
			.first();
		await expect(copyButton).toBeVisible({ timeout: 5000 });
		await copyButton.click();

		// Should show success message
		await expect(
			authenticatedPage.locator('.alert-success, .toast-success, text=/copied|success/i').first()
		).toBeVisible({ timeout: 3000 });
	});

	test('should support different networks', async ({ authenticatedPage }) => {
		// Wait for page to fully load
		await authenticatedPage.waitForLoadState('networkidle');

		// Wait for wallet content to appear
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive")')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Open receive modal
		const receiveButton = authenticatedPage.getByRole('button', { name: /receive/i }).first();
		await expect(receiveButton).toBeVisible({ timeout: 10000 });
		await receiveButton.click();

		// Wait for form
		await authenticatedPage.waitForLoadState('networkidle');

		// Find network selector - could be select, combobox, or details (DaisyUI dropdown)
		const networkSelect = authenticatedPage
			.locator('select, [role="combobox"], details summary')
			.first();
		const isVisible = await networkSelect.isVisible().catch(() => false);

		if (isVisible) {
			// If it's a details element (DaisyUI dropdown), click to open
			const tagName = await networkSelect
				.evaluate((el: Element) => el.tagName.toLowerCase())
				.catch(() => '');
			if (tagName === 'summary' || tagName === 'details') {
				await networkSelect.click();
				await authenticatedPage.waitForTimeout(300);
				// Then select the option
				const lightningOption = authenticatedPage
					.locator(
						'button:has-text("Lightning"), option:has-text("Lightning"), li:has-text("Lightning")'
					)
					.first();
				await expect(lightningOption).toBeVisible({ timeout: 3000 });
				await lightningOption.click();
			} else {
				// It's a select element
				await networkSelect.selectOption(/lightning/i);
			}

			// Wait for network change
			await authenticatedPage.waitForLoadState('networkidle');
		}
	});
});
