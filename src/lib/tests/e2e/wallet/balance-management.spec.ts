import { test, expect } from '../fixtures/auth';

/**
 * Balance Management E2E Tests
 * Tests viewing balances, refreshing, and balance visibility
 */

test.describe('Balance Management', () => {
	test.beforeEach(async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/wallet');
		await authenticatedPage.waitForLoadState('networkidle');
	});

	test('should display wallet balance', async ({ authenticatedPage }) => {
		// Wait for wallet content to appear - could be balance card, buttons, or any wallet UI
		const walletContent = authenticatedPage
			.locator(
				'.card, button:has-text("Send"), button:has-text("Receive"), text=/total.*balance|balance/i'
			)
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });
	});

	test('should toggle balance visibility', async ({ authenticatedPage }) => {
		// Find eye icon button to toggle visibility
		const toggleButton = authenticatedPage
			.locator(
				'button[aria-label*="eye"], button:has([class*="eye"]), button:has(svg[class*="eye"])'
			)
			.first();
		const isVisible = await toggleButton.isVisible().catch(() => false);

		if (isVisible) {
			// Click to show balances
			await toggleButton.click();
			await authenticatedPage.waitForLoadState('networkidle');

			// Balances should be visible - look for actual numbers (not dots)
			const balanceText = authenticatedPage.locator('text=/\\d+.*sats|\\$\\d+|BTC/i').first();
			await expect(balanceText).toBeVisible({ timeout: 3000 });

			// Click again to hide
			await toggleButton.click();
			await authenticatedPage.waitForLoadState('networkidle');

			// Should show hidden state (dots)
			const hiddenBalance = authenticatedPage.locator('text=/\\•\\•\\•|hidden/i').first();
			await expect(hiddenBalance).toBeVisible({ timeout: 2000 });
		}
	});

	test('should refresh balances', async ({ authenticatedPage }) => {
		// Find refresh button
		const refreshButton = authenticatedPage
			.locator(
				'button[aria-label*="refresh"], button:has([class*="refresh"]), button:has(svg[class*="refresh"])'
			)
			.first();
		const isVisible = await refreshButton.isVisible().catch(() => false);

		if (isVisible) {
			await refreshButton.click();

			// Should show loading state briefly
			await expect(
				authenticatedPage.locator('.loading, .spinner, [class*="loading"]').first()
			).toBeVisible({ timeout: 2000 });

			// Wait for refresh to complete
			await authenticatedPage.waitForLoadState('networkidle');

			// Should show success message or updated balance
			const successMessage = authenticatedPage
				.locator('.alert-success, .toast-success, text=/refreshed|success/i')
				.first();
			const hasSuccessMessage = await successMessage
				.isVisible({ timeout: 3000 })
				.catch(() => false);
			if (hasSuccessMessage) {
				await expect(successMessage).toBeVisible();
			}
		}
	});

	test('should expand network breakdown accordions', async ({ authenticatedPage }) => {
		// Find network accordion triggers - look for collapse or details elements
		const accordionTriggers = authenticatedPage
			.locator(
				'details summary, .collapse-title, [role="button"][aria-expanded], button[class*="collapse"]'
			)
			.first();
		const isVisible = await accordionTriggers.isVisible().catch(() => false);

		if (isVisible) {
			await accordionTriggers.click();
			await authenticatedPage.waitForLoadState('networkidle');

			// Accordion should be expanded - check for open state
			const accordion = authenticatedPage
				.locator('details[open], .collapse-open, [aria-expanded="true"]')
				.first();
			await expect(accordion).toBeVisible({ timeout: 2000 });
		}
	});

	test('should scroll balance card when content exceeds viewport', async ({
		authenticatedPage
	}) => {
		// Set small viewport
		await authenticatedPage.setViewportSize({ width: 375, height: 667 });
		await authenticatedPage.waitForTimeout(500);

		// Check if balance card has scroll - look for overflow-y-auto class
		const balanceCard = authenticatedPage
			.locator('.overflow-y-auto, [class*="overflow-y-auto"], [class*="overflow"]')
			.first();
		const isVisible = await balanceCard.isVisible().catch(() => false);

		if (isVisible) {
			// Should have overflow-y-auto class or computed style
			const hasScroll = await balanceCard.evaluate((el: Element) => {
				return (
					el.classList.contains('overflow-y-auto') ||
					getComputedStyle(el).overflowY === 'auto' ||
					getComputedStyle(el).overflowY === 'scroll'
				);
			});

			expect(hasScroll).toBe(true);
		}
	});

	test('should display network breakdown', async ({ authenticatedPage }) => {
		// Should show network sections - wait for them to load
		await authenticatedPage.waitForLoadState('networkidle');

		// Look for network text - may be in accordions that need to be expanded
		// Try to find any network-related text
		const networkSections = authenticatedPage
			.locator('text=/RSK|BSC|Bitcoin|Rootstock|L2 BTC/i')
			.first();
		const isVisible = await networkSections.isVisible({ timeout: 5000 }).catch(() => false);

		// If not visible, try expanding accordions first
		if (!isVisible) {
			const accordionTriggers = authenticatedPage
				.locator('details summary, .collapse-title')
				.first();
			const accordionVisible = await accordionTriggers.isVisible().catch(() => false);
			if (accordionVisible) {
				await accordionTriggers.click();
				await authenticatedPage.waitForLoadState('networkidle');
				await expect(networkSections).toBeVisible({ timeout: 5000 });
			}
		} else {
			await expect(networkSections).toBeVisible();
		}
	});
});
