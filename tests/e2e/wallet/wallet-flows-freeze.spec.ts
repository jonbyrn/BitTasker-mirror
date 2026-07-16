/**
 * Wallet Flows — Comprehensive E2E Tests
 *
 * Tests all major wallet modal/drawer flows for:
 *   - UI responsiveness (no freezes from reactive loops)
 *   - Long task detection (no synchronous main-thread blocking)
 *   - Memory leak detection (heap growth monitoring)
 *   - Basic functionality (modals open/close, inputs work)
 *
 * These tests serve as regression guards for $effect patterns that call
 * async functions, which can cause infinite reactive cascades.
 *
 * Run: npx playwright test tests/e2e/wallet/wallet-flows-freeze.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NSEC_PATH = join(process.cwd(), 'test-nsec.txt');
const WALLET_URL = 'http://localhost:3000/dashboard/wallet';
const SCREENSHOTS = 'tests/e2e/wallet/screenshots';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNsec(): string {
	try {
		return readFileSync(NSEC_PATH, 'utf8').trim();
	} catch {
		return '';
	}
}

async function loginViaNsec(page: import('@playwright/test').Page) {
	const nsec = getNsec();
	if (!nsec) throw new Error('test-nsec.txt not found');
	await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
	await page.evaluate((nsec: string) => {
		localStorage.setItem('nostr_nsec', nsec);
		localStorage.setItem('auth_method', 'nsec');
		localStorage.setItem('nostr_login_done', 'true');
	}, nsec);
}

async function measureResponsiveness(page: import('@playwright/test').Page): Promise<number> {
	const start = Date.now();
	await page.evaluate(() => Promise.resolve());
	return Date.now() - start;
}

async function getHeapSize(page: import('@playwright/test').Page): Promise<number> {
	return page.evaluate(() => {
		const perf = performance as unknown as { memory?: { usedJSHeapSize: number } };
		return perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1024 / 1024) : -1;
	});
}

async function setupLongTaskTracking(page: import('@playwright/test').Page) {
	await page.addInitScript(() => {
		(window as unknown as { __longTasks: number[] }).__longTasks = [];
		if (typeof PerformanceObserver !== 'undefined') {
			try {
				const observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						(window as unknown as { __longTasks: number[] }).__longTasks.push(
							Math.round(entry.duration)
						);
					}
				});
				observer.observe({ entryTypes: ['longtask'] });
			} catch {
				// Long task API not available
			}
		}
	});
}

async function getLongTasks(page: import('@playwright/test').Page): Promise<number[]> {
	return page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
}

async function clearLongTasks(page: import('@playwright/test').Page) {
	await page.evaluate(() => {
		(window as unknown as { __longTasks: number[] }).__longTasks = [];
	});
}

/** Assert no extreme long tasks (>1s) and log summary */
async function assertNoExtremeLongTasks(page: import('@playwright/test').Page, context: string) {
	const longTasks = await getLongTasks(page);
	const extreme = longTasks.filter((d) => d > 1000);
	if (longTasks.length > 0) {
		console.log(`[${context}] Long tasks: ${longTasks.length}, max: ${Math.max(...longTasks)}ms`);
	}
	if (extreme.length > 0) {
		console.log(`⚠️ [${context}] Extreme long tasks (>1s):`, extreme);
	}
	expect(extreme.length).toBe(0);
}

// ---------------------------------------------------------------------------
// Test Suite: Wallet Page Load
// ---------------------------------------------------------------------------

test.describe('Wallet Page Load', () => {
	test.describe.configure({ timeout: 60_000 });

	test.beforeEach(async ({ page }) => {
		await setupLongTaskTracking(page);
	});

	test('wallet page loads without extreme long tasks', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(3000);

		await assertNoExtremeLongTasks(page, 'wallet-load');

		// Verify key elements are present
		const receiveBtn = page
			.locator('button')
			.filter({ hasText: /receive/i })
			.first();
		const sendBtn = page.locator('button').filter({ hasText: /send/i }).first();
		await expect(receiveBtn).toBeVisible({ timeout: 5000 });
		await expect(sendBtn).toBeVisible({ timeout: 5000 });

		await page.screenshot({ path: `${SCREENSHOTS}/wallet-load.png` });
	});

	test('wallet page does not leak memory on repeated navigation', async ({ page }) => {
		await loginViaNsec(page);

		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);
		const heapStart = await getHeapSize(page);
		if (heapStart < 0) {
			test.skip();
			return;
		}

		// Navigate away and back 5 times
		for (let i = 0; i < 5; i++) {
			await page.goto('http://localhost:3000/dashboard', {
				waitUntil: 'networkidle',
				timeout: 15000
			});
			await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 15000 });
			await page.waitForTimeout(500);
		}

		const heapEnd = await getHeapSize(page);
		const growth = heapEnd - heapStart;
		console.log(
			`Heap growth after 5 navigations: ${growth}MB (start=${heapStart}MB, end=${heapEnd}MB)`
		);
		expect(growth).toBeLessThan(30);
	});
});

// ---------------------------------------------------------------------------
// Test Suite: Send Modal
// ---------------------------------------------------------------------------

test.describe('Send Modal — Freeze Detection', () => {
	test.describe.configure({ timeout: 90_000 });

	test.beforeEach(async ({ page }) => {
		await setupLongTaskTracking(page);
	});

	test('send modal opens and does not freeze', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);

		const sendBtn = page.locator('button').filter({ hasText: /send/i }).first();
		if (!(await sendBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		await clearLongTasks(page);
		await sendBtn.click();
		await page.waitForTimeout(1500);

		await page.screenshot({ path: `${SCREENSHOTS}/send-modal-open.png` });
		await assertNoExtremeLongTasks(page, 'send-modal-open');

		// Close modal
		await page.keyboard.press('Escape');
		await page.waitForTimeout(500);
	});

	test('send modal amount input does not freeze UI', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);

		const sendBtn = page.locator('button').filter({ hasText: /send/i }).first();
		if (!(await sendBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		await sendBtn.click();
		await page.waitForTimeout(1500);

		// Look for calculator keypad or amount input in the send modal
		const keypad = page.locator('.calculator-keypad');
		const amountInput = page
			.locator('input[inputmode="decimal"], input[inputmode="numeric"]')
			.first();

		const hasKeypad = await keypad.isVisible({ timeout: 2000 }).catch(() => false);
		const hasInput = await amountInput.isVisible({ timeout: 2000 }).catch(() => false);

		if (!hasKeypad && !hasInput) {
			console.log('No amount input found in send modal — skipping input test');
			test.skip();
			return;
		}

		await clearLongTasks(page);

		if (hasKeypad) {
			// Type via calculator
			const timings: number[] = [];
			for (const key of ['1', '0', '0']) {
				const start = Date.now();
				await keypad.locator('button', { hasText: key }).first().click({ timeout: 2000 });
				timings.push(Date.now() - start);
				await page.waitForTimeout(100);
			}
			console.log('Send calculator timings:', timings);
			for (const t of timings) expect(t).toBeLessThan(2000);
		} else if (hasInput) {
			// Type directly
			await amountInput.fill('100');
		}

		await page.waitForTimeout(500);
		const resp = await measureResponsiveness(page);
		console.log('Send modal responsiveness after typing:', resp + 'ms');
		expect(resp).toBeLessThan(2000);

		await page.screenshot({ path: `${SCREENSHOTS}/send-modal-typed.png` });
		await assertNoExtremeLongTasks(page, 'send-modal-typing');

		// Close
		await page.keyboard.press('Escape');
	});
});

// ---------------------------------------------------------------------------
// Test Suite: Swap Drawer
// ---------------------------------------------------------------------------

test.describe('Swap Drawer — Freeze Detection', () => {
	test.describe.configure({ timeout: 90_000 });

	test.beforeEach(async ({ page }) => {
		await setupLongTaskTracking(page);
	});

	test('swap drawer opens and does not freeze', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);

		const swapBtn = page.locator('button').filter({ hasText: /swap/i }).first();
		if (!(await swapBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		await clearLongTasks(page);
		await swapBtn.click();
		await page.waitForTimeout(1500);

		await page.screenshot({ path: `${SCREENSHOTS}/swap-drawer-open.png` });
		await assertNoExtremeLongTasks(page, 'swap-drawer-open');

		// Close drawer
		const closeBtn = page.locator('[role="dialog"] button[aria-label="Close"]').first();
		if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
			await closeBtn.click();
		} else {
			await page.keyboard.press('Escape');
		}
		await page.waitForTimeout(500);
	});

	test('swap drawer amount input does not freeze UI', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);

		const swapBtn = page.locator('button').filter({ hasText: /swap/i }).first();
		if (!(await swapBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		await swapBtn.click();
		await page.waitForTimeout(1500);

		// Look for amount input in the swap drawer
		const amountInput = page
			.locator('input[inputmode="decimal"], input[inputmode="numeric"]')
			.first();
		if (!(await amountInput.isVisible({ timeout: 3000 }).catch(() => false))) {
			console.log('No amount input found in swap drawer');
			test.skip();
			return;
		}

		await clearLongTasks(page);

		// Type an amount
		await amountInput.fill('0.001');
		await page.waitForTimeout(500);

		const resp = await measureResponsiveness(page);
		console.log('Swap drawer responsiveness after typing:', resp + 'ms');
		expect(resp).toBeLessThan(2000);

		await page.screenshot({ path: `${SCREENSHOTS}/swap-drawer-typed.png` });
		await assertNoExtremeLongTasks(page, 'swap-drawer-typing');

		// Close
		await page.keyboard.press('Escape');
	});
});

// ---------------------------------------------------------------------------
// Test Suite: Buy/Sell Drawer
// ---------------------------------------------------------------------------

test.describe('Buy/Sell Drawer — Freeze Detection', () => {
	test.describe.configure({ timeout: 90_000 });

	test.beforeEach(async ({ page }) => {
		await setupLongTaskTracking(page);
	});

	test('buy/sell drawer opens and does not freeze', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);

		// The Buy/Sell button is labeled "Bank" on the wallet page
		const bankBtn = page.locator('button').filter({ hasText: /bank/i }).first();
		if (!(await bankBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
			// Try alternate: "Buy" button
			const buyBtn = page.locator('button').filter({ hasText: /buy/i }).first();
			if (!(await buyBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
				test.skip();
				return;
			}
			await buyBtn.click();
		} else {
			await bankBtn.click();
		}

		await page.waitForTimeout(1500);
		await page.screenshot({ path: `${SCREENSHOTS}/buysell-drawer-open.png` });
		await assertNoExtremeLongTasks(page, 'buysell-drawer-open');

		// Close
		await page.keyboard.press('Escape');
		await page.waitForTimeout(500);
	});

	test('buy/sell amount input does not freeze UI', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);

		// Open buy/sell
		const bankBtn = page.locator('button').filter({ hasText: /bank/i }).first();
		if (!(await bankBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		await bankBtn.click();
		await page.waitForTimeout(1500);

		// Try quick amount buttons ($10, $50, $100)
		const quickBtns = ['$10', '$50', '$100'];
		await clearLongTasks(page);

		for (const amt of quickBtns) {
			const btn = page.locator('button', { hasText: amt }).first();
			if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
				const start = Date.now();
				await btn.click();
				const duration = Date.now() - start;
				console.log(`Quick amount ${amt}: ${duration}ms`);
				expect(duration).toBeLessThan(2000);
				await page.waitForTimeout(200);
			}
		}

		// Try direct amount input
		const amountInput = page.locator('#amount-input, input[placeholder="0.00"]').first();
		if (await amountInput.isVisible({ timeout: 1000 }).catch(() => false)) {
			await amountInput.fill('50');
			await page.waitForTimeout(500);
		}

		const resp = await measureResponsiveness(page);
		console.log('Buy/Sell responsiveness after input:', resp + 'ms');
		expect(resp).toBeLessThan(2000);

		await page.screenshot({ path: `${SCREENSHOTS}/buysell-drawer-typed.png` });
		await assertNoExtremeLongTasks(page, 'buysell-input');

		// Test tab switching (Buy ↔ Sell)
		const sellTab = page.locator('[role="tab"]', { hasText: /sell/i }).first();
		if (await sellTab.isVisible({ timeout: 1000 }).catch(() => false)) {
			await clearLongTasks(page);
			await sellTab.click();
			await page.waitForTimeout(500);
			await assertNoExtremeLongTasks(page, 'buysell-sell-tab');
		}

		const buyTab = page.locator('[role="tab"]', { hasText: /buy/i }).first();
		if (await buyTab.isVisible({ timeout: 1000 }).catch(() => false)) {
			await buyTab.click();
			await page.waitForTimeout(500);
		}

		// Close
		await page.keyboard.press('Escape');
	});
});

// ---------------------------------------------------------------------------
// Test Suite: Modal Open/Close Cycles
// ---------------------------------------------------------------------------

test.describe('Modal Open/Close Cycles', () => {
	test.describe.configure({ timeout: 90_000 });

	test.beforeEach(async ({ page }) => {
		await setupLongTaskTracking(page);
	});

	test('rapidly opening and closing modals does not leak memory or freeze', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);

		const heapStart = await getHeapSize(page);
		if (heapStart < 0) {
			test.skip();
			return;
		}

		const receiveBtn = page
			.locator('button')
			.filter({ hasText: /receive/i })
			.first();
		const sendBtn = page.locator('button').filter({ hasText: /send/i }).first();

		if (!(await receiveBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		await clearLongTasks(page);

		// Open/close receive modal 5 times
		for (let i = 0; i < 5; i++) {
			await receiveBtn.click();
			await page.waitForTimeout(300);
			await page.keyboard.press('Escape');
			await page.waitForTimeout(300);
		}

		// Open/close send modal 5 times
		if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
			for (let i = 0; i < 5; i++) {
				await sendBtn.click();
				await page.waitForTimeout(300);
				await page.keyboard.press('Escape');
				await page.waitForTimeout(300);
			}
		}

		const heapEnd = await getHeapSize(page);
		const growth = heapEnd - heapStart;
		console.log(`Heap growth after 10 modal open/close cycles: ${growth}MB`);
		expect(growth).toBeLessThan(15);

		await assertNoExtremeLongTasks(page, 'modal-cycles');
	});
});

// ---------------------------------------------------------------------------
// Test Suite: Combined Stress Test
// ---------------------------------------------------------------------------

test.describe('Combined Stress Test', () => {
	test.describe.configure({ timeout: 120_000 });

	test.beforeEach(async ({ page }) => {
		await setupLongTaskTracking(page);
	});

	test('wallet survives combined interactions without freezing', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);

		const heapStart = await getHeapSize(page);

		// 1. Open receive modal and type
		const receiveBtn = page
			.locator('button')
			.filter({ hasText: /receive/i })
			.first();
		if (await receiveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
			await receiveBtn.click();
			await page.waitForTimeout(1000);

			const keypad = page.locator('.calculator-keypad');
			if (await keypad.isVisible({ timeout: 3000 }).catch(() => false)) {
				for (const key of ['5', '0', '0']) {
					await keypad.locator('button', { hasText: key }).first().click({ timeout: 2000 });
					await page.waitForTimeout(50);
				}
			}
			await page.keyboard.press('Escape');
			await page.waitForTimeout(500);
		}

		// 2. Open send modal
		const sendBtn = page.locator('button').filter({ hasText: /send/i }).first();
		if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
			await sendBtn.click();
			await page.waitForTimeout(1000);
			await page.keyboard.press('Escape');
			await page.waitForTimeout(500);
		}

		// 3. Open swap drawer
		const swapBtn = page.locator('button').filter({ hasText: /swap/i }).first();
		if (await swapBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
			await swapBtn.click();
			await page.waitForTimeout(1000);
			await page.keyboard.press('Escape');
			await page.waitForTimeout(500);
		}

		// 4. Final responsiveness check
		const resp = await measureResponsiveness(page);
		console.log('Combined stress test responsiveness:', resp + 'ms');
		expect(resp).toBeLessThan(2000);

		// 5. Memory check
		if (heapStart > 0) {
			const heapEnd = await getHeapSize(page);
			console.log(
				`Combined stress heap: start=${heapStart}MB, end=${heapEnd}MB, growth=${heapEnd - heapStart}MB`
			);
			expect(heapEnd - heapStart).toBeLessThan(30);
		}

		await page.screenshot({ path: `${SCREENSHOTS}/combined-stress-final.png` });
	});
});
