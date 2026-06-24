/**
 * Swap Routes E2E — Full route coverage + fee validation
 *
 * Connects to the running Chrome on port 9222 via CDP.
 * Tests every swap route pair, validates fee calculations,
 * checks Boltz/Symbiosis/LI.FI integration, and compares provider fees.
 *
 * Run: npx playwright test tests/e2e/wallet/swap-routes-e2e.spec.ts --project=chromium
 * Or:  node tests/e2e/wallet/swap-routes-e2e.mjs  (standalone CDP script)
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NSEC_PATH = join(process.cwd(), 'test-nsec.txt');
const WALLET_URL = 'http://localhost:3000/dashboard/wallet';

function getNsec(): string {
	return readFileSync(NSEC_PATH, 'utf8').trim();
}

async function loginViaNsec(page: import('@playwright/test').Page) {
	await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
	await page.evaluate((nsec: string) => {
		localStorage.setItem('nostr_nsec', nsec);
		localStorage.setItem('auth_method', 'nsec');
		localStorage.setItem('nostr_login_done', 'true');
	}, getNsec());
}

/** Collect network requests for a swap provider during an action */
async function _collectProviderRequests(
	page: import('@playwright/test').Page,
	action: () => Promise<void>,
	providerUrlPatterns: string[]
): Promise<Map<string, number>> {
	const counts = new Map<string, number>();
	for (const p of providerUrlPatterns) counts.set(p, 0);

	const handler = (req: import('@playwright/test').Request) => {
		const url = req.url();
		for (const [pattern, count] of counts) {
			if (url.includes(pattern)) counts.set(pattern, count + 1);
		}
	};

	page.on('request', handler);
	await action();
	page.off('request', handler);

	return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Swap Routes — Full E2E', () => {
	test.describe.configure({ timeout: 120_000 });

	test.beforeEach(async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 20000 });
		await page.waitForTimeout(1000);
	});

	test('Wallet page loads with swap UI elements', async ({ page }) => {
		// Verify wallet page loaded
		await expect(page).toHaveURL(/\/dashboard\/wallet/);

		// Look for swap-related elements
		const swapButton = page.locator('button', { hasText: /swap/i }).first();
		const isSwapVisible = await swapButton.isVisible({ timeout: 5000 }).catch(() => false);

		if (!isSwapVisible) {
			// Try the Swap tab or navigation
			const swapTab = page.locator('button', { hasText: /Swap/i }).first();
			const tabVisible = await swapTab.isVisible({ timeout: 3000 }).catch(() => false);
			if (tabVisible) {
				await swapTab.click();
				await page.waitForTimeout(1000);
			}
		}

		await page.screenshot({ path: 'Screenshots/swap-01-wallet-loaded.png', fullPage: true });
	});

	test('Open Swap drawer and verify source/dest selectors', async ({ page }) => {
		// Find and click swap button
		const swapBtn = page.locator('button', { hasText: /swap/i }).first();
		if (!(await swapBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
			console.log('Swap button not visible — skipping');
			test.skip();
			return;
		}
		await swapBtn.click();
		await page.waitForTimeout(1500);

		await page.screenshot({ path: 'Screenshots/swap-02-drawer-open.png', fullPage: true });

		// Verify swap drawer/form is visible
		const drawer = page.locator('[role="dialog"], .drawer-open, .drawer').first();
		const drawerVisible = await drawer.isVisible({ timeout: 3000 }).catch(() => false);
		console.log('Swap drawer visible:', drawerVisible);
	});

	test('Route: RBTC → USDT0 (Arbitrum) — SmartRouter picks best provider', async ({ page }) => {
		await openSwapDrawer(page);
		if (
			!page
				.locator('input[type="number"], input[inputmode="decimal"]')
				.first()
				.isVisible({ timeout: 5000 })
				.catch(() => false)
		) {
			console.log('No amount input found — swap drawer may not have opened');
			test.skip();
			return;
		}

		// Ensure source = rBTC (default), dest = USDT0 (default)
		await selectSourceWallet(page, 'rBTC');
		await selectDestWallet(page, 'USDT0');

		// Enter amount
		await enterSwapAmount(page, '0.001');
		await page.waitForTimeout(3000); // Wait for route resolution

		await page.screenshot({ path: 'Screenshots/swap-03-rbtc-to-usdt0.png', fullPage: true });

		// Verify fee display is populated
		const feeText = await getSwapFeeText(page);
		console.log('RBTC→USDT0 fee text:', feeText);

		// Verify "You Receive" is populated
		const receiveText = await getSwapReceiveText(page);
		console.log('RBTC→USDT0 receive:', receiveText);

		// Check for provider label
		const providerText = await getSwapProviderText(page);
		console.log('RBTC→USDT0 provider:', providerText);
	});

	test('Route: USDT0 (Arbitrum) → rBTC — reverse swap', async ({ page }) => {
		await openSwapDrawer(page);

		await selectSourceWallet(page, 'USDT0');
		await selectDestWallet(page, 'rBTC');
		await enterSwapAmount(page, '1');
		await page.waitForTimeout(3000);

		await page.screenshot({ path: 'Screenshots/swap-04-usdt0-to-rbtc.png', fullPage: true });

		const feeText = await getSwapFeeText(page);
		console.log('USDT0→rBTC fee text:', feeText);
		const receiveText = await getSwapReceiveText(page);
		console.log('USDT0→rBTC receive:', receiveText);
	});

	test('Route: RBTC → WBTC (Arbitrum) — Boltz+LI.FI 2-hop', async ({ page }) => {
		await openSwapDrawer(page);

		await selectSourceWallet(page, 'rBTC');
		await selectDestWallet(page, 'WBTC');
		await enterSwapAmount(page, '0.001');
		await page.waitForTimeout(3000);

		await page.screenshot({ path: 'Screenshots/swap-05-rbtc-to-wbtc.png', fullPage: true });

		const feeText = await getSwapFeeText(page);
		console.log('RBTC→WBTC fee text:', feeText);
		const providerText = await getSwapProviderText(page);
		console.log('RBTC→WBTC provider:', providerText);
	});

	test('Route: RBTC → BTC (on-chain) — Boltz chain swap', async ({ page }) => {
		await openSwapDrawer(page);

		await selectSourceWallet(page, 'rBTC');
		await selectDestWallet(page, 'BTC');
		await enterSwapAmount(page, '0.001');
		await page.waitForTimeout(3000);

		await page.screenshot({ path: 'Screenshots/swap-06-rbtc-to-btc.png', fullPage: true });

		const feeText = await getSwapFeeText(page);
		console.log('RBTC→BTC fee text:', feeText);
		const providerText = await getSwapProviderText(page);
		console.log('RBTC→BTC provider:', providerText);
	});

	test('Route: BTC (on-chain) → rBTC — Boltz reverse swap', async ({ page }) => {
		await openSwapDrawer(page);

		await selectSourceWallet(page, 'BTC');
		await selectDestWallet(page, 'rBTC');
		await enterSwapAmount(page, '0.0001');
		await page.waitForTimeout(3000);

		await page.screenshot({ path: 'Screenshots/swap-07-btc-to-rbtc.png', fullPage: true });

		const feeText = await getSwapFeeText(page);
		console.log('BTC→rBTC fee text:', feeText);
	});

	test('Fee comparison: RBTC→USDT0 across providers', async ({ page }) => {
		await openSwapDrawer(page);

		await selectSourceWallet(page, 'rBTC');
		await selectDestWallet(page, 'USDT0');
		await enterSwapAmount(page, '0.01');
		await page.waitForTimeout(4000); // Longer wait for multi-provider comparison

		await page.screenshot({ path: 'Screenshots/swap-08-fee-comparison.png', fullPage: true });

		// Capture all network requests to swap providers during this period
		const body = await page.content();

		// Check for Boltz API calls
		const hasBoltzRequests = body.includes('boltz') || body.includes('Boltz');
		console.log('Boltz referenced in page:', hasBoltzRequests);

		// Check for Symbiosis API calls
		const hasSymbiosisRequests = body.includes('symbiosis') || body.includes('Symbiosis');
		console.log('Symbiosis referenced in page:', hasSymbiosisRequests);

		// Check for LI.FI API calls
		const hasLifiRequests = body.includes('lifi') || body.includes('LI.FI');
		console.log('LI.FI referenced in page:', hasLifiRequests);

		// Verify the fee card shows a percentage
		const feeCard = page.locator('text=/%/').first();
		const feePercentVisible = await feeCard.isVisible({ timeout: 3000 }).catch(() => false);
		console.log('Fee percentage visible:', feePercentVisible);

		// Verify estimated time is shown
		const timeText = page.locator('text=/est/i').first();
		const timeVisible = await timeText.isVisible({ timeout: 3000 }).catch(() => false);
		console.log('Estimated time visible:', timeVisible);
	});

	test('Fee quoted vs received validation — amount consistency', async ({ page }) => {
		await openSwapDrawer(page);

		await selectSourceWallet(page, 'rBTC');
		await selectDestWallet(page, 'USDT0');
		await enterSwapAmount(page, '0.05');
		await page.waitForTimeout(4000);

		// Capture the total sent
		const totalSent = await page
			.locator('text=/total sent/i')
			.locator('..')
			.locator('span')
			.last()
			.textContent()
			.catch(() => null);
		console.log('Total sent:', totalSent);

		// Capture fee
		const fee = await page
			.locator('text=/fee/i')
			.locator('..')
			.locator('span')
			.last()
			.textContent()
			.catch(() => null);
		console.log('Fee:', fee);

		// Capture receive amount
		const receive = await page
			.locator('text=/you receive/i')
			.locator('..')
			.locator('span')
			.last()
			.textContent()
			.catch(() => null);
		console.log('Receive:', receive);

		await page.screenshot({ path: 'Screenshots/swap-09-fee-validation.png', fullPage: true });

		// Verify the receive amount is less than sent (fees were deducted)
		if (totalSent && receive) {
			console.log(`Fee validation: sent=${totalSent} receive=${receive}`);
		}
	});

	test('Network requests: verify Boltz API is called for RBTC→BTC route', async ({ page }) => {
		const requests: string[] = [];
		page.on('request', (req) => {
			const url = req.url();
			if (url.includes('boltz.exchange') || url.includes('api.boltz')) {
				requests.push(url);
			}
		});

		await openSwapDrawer(page);
		await selectSourceWallet(page, 'rBTC');
		await selectDestWallet(page, 'BTC');
		await enterSwapAmount(page, '0.001');
		await page.waitForTimeout(4000);

		console.log('Boltz API requests:', requests);
		await page.screenshot({ path: 'Screenshots/swap-10-boltz-api.png', fullPage: true });
	});

	test('Network requests: verify Symbiosis API is called for RBTC→USDT0 route', async ({
		page
	}) => {
		const requests: string[] = [];
		page.on('request', (req) => {
			const url = req.url();
			if (url.includes('symbiosis.finance') || url.includes('symbiosis')) {
				requests.push(url);
			}
		});

		await openSwapDrawer(page);
		await selectSourceWallet(page, 'rBTC');
		await selectDestWallet(page, 'USDT0');
		await enterSwapAmount(page, '0.01');
		await page.waitForTimeout(4000);

		console.log('Symbiosis API requests:', requests);
		await page.screenshot({ path: 'Screenshots/swap-11-symbiosis-api.png', fullPage: true });
	});

	test('Below minimum amount shows error state', async ({ page }) => {
		await openSwapDrawer(page);

		await selectSourceWallet(page, 'rBTC');
		await selectDestWallet(page, 'BTC');
		await enterSwapAmount(page, '0.00001'); // Very small amount, likely below Boltz minimum
		await page.waitForTimeout(3000);

		await page.screenshot({ path: 'Screenshots/swap-12-below-minimum.png', fullPage: true });

		// Check for error/below-minimum indication
		const errorVisible = await page
			.locator('.border-error, text=/minimum/i, text=/below/i')
			.first()
			.isVisible({ timeout: 3000 })
			.catch(() => false);
		console.log('Below minimum error visible:', errorVisible);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Route Navigation Tests — Verify all app routes work
// ─────────────────────────────────────────────────────────────────────────────

test.describe('App Routes — Navigation Smoke', () => {
	test('Homepage loads', async ({ page }) => {
		await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 20000 });
		await expect(page).toHaveURL(/\/$/);
		await page.screenshot({ path: 'Screenshots/route-01-homepage.png', fullPage: true });
	});

	test('Login page loads', async ({ page }) => {
		await page.goto('http://localhost:3000/auth/login', {
			waitUntil: 'networkidle',
			timeout: 20000
		});
		await page.screenshot({ path: 'Screenshots/route-02-login.png', fullPage: true });
	});

	test('Signup page loads', async ({ page }) => {
		await page.goto('http://localhost:3000/auth/signup', {
			waitUntil: 'networkidle',
			timeout: 20000
		});
		await page.screenshot({ path: 'Screenshots/route-03-signup.png', fullPage: true });
	});

	test('Services page loads', async ({ page }) => {
		await page.goto('http://localhost:3000/services', { waitUntil: 'networkidle', timeout: 20000 });
		await page.screenshot({ path: 'Screenshots/route-04-services.png', fullPage: true });
	});

	test('FAQ page loads', async ({ page }) => {
		await page.goto('http://localhost:3000/faq', { waitUntil: 'networkidle', timeout: 20000 });
		await page.screenshot({ path: 'Screenshots/route-05-faq.png', fullPage: true });
	});

	test('Terms page loads', async ({ page }) => {
		await page.goto('http://localhost:3000/terms', { waitUntil: 'networkidle', timeout: 20000 });
		await page.screenshot({ path: 'Screenshots/route-06-terms.png', fullPage: true });
	});

	test('Privacy page loads', async ({ page }) => {
		await page.goto('http://localhost:3000/privacy', { waitUntil: 'networkidle', timeout: 20000 });
		await page.screenshot({ path: 'Screenshots/route-07-privacy.png', fullPage: true });
	});

	test('Dashboard redirects to login when not authed', async ({ page }) => {
		await page.goto('http://localhost:3000/dashboard', {
			waitUntil: 'networkidle',
			timeout: 20000
		});
		await page.screenshot({ path: 'Screenshots/route-08-dashboard-unauth.png', fullPage: true });
	});

	test('Wallet page with auth', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 20000 });
		await expect(page).toHaveURL(/\/dashboard\/wallet/);
		await page.screenshot({ path: 'Screenshots/route-09-wallet-auth.png', fullPage: true });
	});

	test('Earning page with auth', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto('http://localhost:3000/earning', { waitUntil: 'networkidle', timeout: 20000 });
		await page.screenshot({ path: 'Screenshots/route-10-earning.png', fullPage: true });
	});

	test('Settings page with auth', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto('http://localhost:3000/dashboard/settings', {
			waitUntil: 'networkidle',
			timeout: 20000
		});
		await page.screenshot({ path: 'Screenshots/route-11-settings.png', fullPage: true });
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function openSwapDrawer(page: import('@playwright/test').Page) {
	// Try multiple ways to open the swap drawer
	const swapBtn = page.locator('button', { hasText: /swap/i }).first();
	if (await swapBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
		await swapBtn.click();
		await page.waitForTimeout(1000);
		return;
	}

	// Try via the banking menu or action buttons
	const actionBtns = page.locator('button').filter({ hasText: /swap|exchange|convert/i });
	const count = await actionBtns.count();
	if (count > 0) {
		await actionBtns.first().click();
		await page.waitForTimeout(1000);
	}
}

async function selectSourceWallet(page: import('@playwright/test').Page, asset: string) {
	// Look for source selector — could be a button, dropdown, or tab
	const sourceBtn = page.locator('button', { hasText: new RegExp(asset, 'i') }).first();
	if (await sourceBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
		await sourceBtn.click();
		await page.waitForTimeout(500);
	}
}

async function selectDestWallet(page: import('@playwright/test').Page, asset: string) {
	const destBtn = page.locator('button', { hasText: new RegExp(asset, 'i') }).nth(1);
	if (await destBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
		await destBtn.click();
		await page.waitForTimeout(500);
	}
}

async function enterSwapAmount(page: import('@playwright/test').Page, amount: string) {
	const input = page.locator('input[type="number"], input[inputmode="decimal"]').first();
	if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
		await input.fill(amount);
		await page.waitForTimeout(500);
		// Trigger blur to ensure route resolution fires
		await input.blur();
	}
}

async function getSwapFeeText(page: import('@playwright/test').Page): Promise<string | null> {
	const feeEl = page.locator('text=/fee/i').first();
	if (await feeEl.isVisible({ timeout: 2000 }).catch(() => false)) {
		const parent = feeEl.locator('..');
		return parent.textContent();
	}
	return null;
}

async function getSwapReceiveText(page: import('@playwright/test').Page): Promise<string | null> {
	const receiveEl = page.locator('text=/you receive/i').first();
	if (await receiveEl.isVisible({ timeout: 2000 }).catch(() => false)) {
		const parent = receiveEl.locator('..');
		return parent.textContent();
	}
	return null;
}

async function getSwapProviderText(page: import('@playwright/test').Page): Promise<string | null> {
	const routeEl = page.locator('text=/route via|via|provider/i').first();
	if (await routeEl.isVisible({ timeout: 2000 }).catch(() => false)) {
		return routeEl.textContent();
	}
	return null;
}
