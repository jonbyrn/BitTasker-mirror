/**
 * E2E test for the debug swap recovery page.
 *
 * Validates that:
 * 1. The page loads and fetches swaps from Nostr
 * 2. Addresses are properly EIP-55 checksummed before passing to ethers
 * 3. The claim flow doesn't fail with "bad address checksum"
 *
 * Backend API calls are intercepted to prevent 401 auth redirects
 * (JWT may be expired). Boltz API, Nostr relays, and Arbitrum RPC
 * pass through normally.
 */
import { test, expect } from '@playwright/test';

test.describe('Debug Swap Recovery — address checksum', () => {
	test('claim flow should not fail with bad address checksum', async ({ page }) => {
		// Intercept both dev-mode and prod backend URLs to prevent 401 session clears
		const backendUrls = ['http://localhost:8000', 'https://api.bittasker.com'];
		for (const backendUrl of backendUrls) {
			await page.route(`${backendUrl}/**`, async (route) => {
				const url = route.request().url();
				if (url.includes('/auth/refresh')) {
					return route.fulfill({
						status: 200,
						contentType: 'application/json',
						body: JSON.stringify({ access_token: 'e2e-intercepted-token', refresh_token: 'e2e-intercepted-refresh' })
					});
				}
				return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
			});
		}

		// Navigate to the debug swap recovery page
		await page.goto('/debug-swaps');

		// Wait for wallet initialization
		await expect(page.getByText('RSK:').first()).toBeVisible({ timeout: 30000 });
		console.log('✓ Wallet initialized');

		// Wait for swaps to load from Nostr
		await page.locator('text=Loading swaps from Nostr').waitFor({ state: 'hidden', timeout: 60000 });
		console.log('✓ Swaps loaded from Nostr');

		// Wait for Boltz status checks (sequential, up to 8s each)
		await page.waitForTimeout(25000);

		// Take screenshot
		await page.screenshot({ path: 'tests/e2e/screenshots/debug-swaps-e2e-loaded.png', fullPage: true });

		// Count Recover Funds buttons
		const recoverBtnCount = await page.locator('button:has-text("Recover Funds")').count();
		console.log('Recover Funds buttons:', recoverBtnCount);

		// Log all status badges
		const allBadges = await page.locator('.badge').allTextContents();
		console.log('All badges:', allBadges);

		if (recoverBtnCount === 0) {
			await page.screenshot({ path: 'tests/e2e/screenshots/debug-swaps-no-claimable.png', fullPage: true });
			const noSwapsMsg = await page.locator('text=No swaps found').count();
			if (noSwapsMsg > 0) {
				console.log('No swaps found on Nostr for this account — page loaded correctly');
			} else {
				const swapCards = await page.locator('.card .card-body').count();
				console.log('Swap cards found:', swapCards, '— but none claimable');
			}
			// Key assertion: page loaded without auth redirect
			expect(page.url()).toContain('/debug-swaps');
			expect(page.url()).not.toContain('/auth/login');
			return;
		}

		// Click the first Recover Funds button
		await page.locator('button:has-text("Recover Funds")').first().click();
		console.log('Clicked Recover Funds');

		// Wait for result (up to 180s — includes Symbiosis bridge + claim)
		const resultLocator = page.locator('[class*="bg-success"], [class*="bg-error"]').first();
		await resultLocator.waitFor({ timeout: 180000 });
		const resultText = await resultLocator.textContent();
		console.log('Claim result:', resultText);

		await page.screenshot({ path: 'tests/e2e/screenshots/debug-swaps-claim-result.png', fullPage: true });

		// CRITICAL: should NOT get a checksum error
		expect(resultText).not.toContain('bad address checksum');
		expect(resultText).not.toContain('INVALID_ARGUMENT');
		expect(resultText).not.toMatch(/checksum/i);
	});
});
