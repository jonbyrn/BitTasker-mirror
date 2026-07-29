import { test, expect } from '@playwright/test';

test('debug swap recovery page loads and shows swaps', async ({ page }) => {
	// Navigate to the page
	await page.goto('/debug-swaps');

	// Wait for page to load (either wallet init or redirect)
	await page.waitForLoadState('networkidle');

	// Take screenshot of whatever state we're in
	await page.screenshot({ path: 'tests/e2e/screenshots/debug-swaps-1-initial.png', fullPage: true });

	// Log the page title and URL
	const title = await page.title();
	const url = page.url();
	console.log('Title:', title);
	console.log('URL:', url);

	// If we got redirected to login, the auth seed isn't working
	if (url.includes('/auth/login')) {
		console.log('ERROR: Redirected to login — auth seed not working');
		return;
	}

	// Wait for wallet to initialize (max10s)
	try {
		await page.locator('text=RSK:').waitFor({ timeout: 10000 });
		console.log('Wallet initialized');
	} catch {
		console.log('Wallet did not initialize in time');
		await page.screenshot({ path: 'tests/e2e/screenshots/debug-swaps-no-wallet.png', fullPage: true });
		return;
	}

	// Wait for "Loading swaps" to disappear (max30s for Nostr fetch)
	try {
		await page.locator('text=Loading swaps from Nostr').waitFor({ state: 'hidden', timeout: 30000 });
		console.log('Swaps loaded from Nostr');
	} catch {
		console.log('Swaps did not load in time');
		await page.screenshot({ path: 'tests/e2e/screenshots/debug-swaps-no-load.png', fullPage: true });
		return;
	}

	// Screenshot after Nostr load
	await page.screenshot({ path: 'tests/e2e/screenshots/debug-swaps-2-loaded.png', fullPage: true });

	// Wait a bit for Boltz checks to complete (parallel,8s timeout)
	await page.waitForTimeout(15000);

	// Screenshot after Boltz checks
	await page.screenshot({ path: 'tests/e2e/screenshots/debug-swaps-3-boltz.png', fullPage: true });

	// Count spinners (should be0 after Boltz checks complete)
	const spinners = await page.locator('.loading-spinner').count();
	console.log('Spinners remaining:', spinners);

	// Check dates — log all "Created:" text
	const createdTexts = await page.locator('text=/Created:/').allTextContents();
	for (const text of createdTexts) {
		console.log('Date:', text);
		// Should NOT be year58000+
		expect(text).not.toMatch(/\/58\d{2}/);
	}

	// Check for Recover Funds buttons
	const recoverBtns = await page.locator('button:has-text("Recover Funds")').count();
	console.log('Recover Funds buttons:', recoverBtns);

	// Check for status badges
	const badges = await page.locator('.badge').allTextContents();
	console.log('Status badges:', badges.slice(0, 10));
});
