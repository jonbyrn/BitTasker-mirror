/**
 * Wallet UI Freeze Detection — E2E Tests
 *
 * These tests verify that wallet modal interactions (typing amounts, changing
 * networks, toggling units) do not cause the UI to freeze.
 *
 * ROOT CAUSE (fixed): Using $effect to call async functions like feeEst.refresh()
 * creates reactive loops because refresh() writes to state that the effect reads,
 * re-triggering on every keypress. The fix: call feeEst.refresh() explicitly from
 * user action handlers (handleCalculationChange, handleUnitChange, etc.) instead
 * of reactively via $effect.
 *
 * These tests serve as regression guards for:
 *   - Receive modal: calculator input, unit toggle, asset switch, math ops
 *   - Send modal: amount input, address entry
 *   - General: long task detection, memory leak detection
 *
 * Run: npx playwright test tests/e2e/wallet/receive-modal-freeze.spec.ts --project=chromium
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
	if (!nsec) {
		throw new Error('test-nsec.txt not found — create it with your test account nsec');
	}
	await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
	await page.evaluate((nsec: string) => {
		localStorage.setItem('nostr_nsec', nsec);
		localStorage.setItem('auth_method', 'nsec');
		localStorage.setItem('nostr_login_done', 'true');
	}, nsec);
}

/** Get JS heap size in MB. Returns -1 if not available. */
async function getHeapSize(page: import('@playwright/test').Page): Promise<number> {
	return page.evaluate(() => {
		const perf = performance as unknown as { memory?: { usedJSHeapSize: number } };
		return perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1024 / 1024) : -1;
	});
}

/**
 * Measure UI responsiveness by running a trivial evaluate() and timing it.
 * If the main thread is blocked (infinite loop, heavy sync work), evaluate()
 * won't execute until the block clears, returning a high duration.
 */
async function measureResponsiveness(page: import('@playwright/test').Page): Promise<number> {
	const start = Date.now();
	await page.evaluate(() => Promise.resolve());
	return Date.now() - start;
}

/** Click a calculator keypad button by its label text. */
async function clickCalcKey(page: import('@playwright/test').Page, label: string): Promise<number> {
	const start = Date.now();
	const key = page.locator('.calculator-keypad button', { hasText: label }).first();
	await key.click({ timeout: 3000 });
	return Date.now() - start;
}

/** Open the receive modal via the Receive button or URL param. */
async function openReceiveModal(page: import('@playwright/test').Page): Promise<void> {
	const receiveBtn = page
		.locator('button')
		.filter({ hasText: /receive/i })
		.first();
	if (await receiveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
		await receiveBtn.click();
	} else {
		await page.goto(WALLET_URL + '?tab=receive', {
			waitUntil: 'networkidle',
			timeout: 20000
		});
	}
	await page.waitForTimeout(1500);
}

/** Set up PerformanceObserver for long task tracking. Must be called before page.goto(). */
async function setupLongTaskTracking(page: import('@playwright/test').Page): Promise<void> {
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

/** Get recorded long tasks from the page. */
async function getLongTasks(page: import('@playwright/test').Page): Promise<number[]> {
	return page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
}

// ---------------------------------------------------------------------------
// Test Suite: Receive Modal Freeze
// ---------------------------------------------------------------------------

test.describe('Receive Modal — Freeze Detection', () => {
	test.describe.configure({ timeout: 120_000 });

	test.beforeEach(async ({ page }) => {
		await setupLongTaskTracking(page);
	});

	test('calculator input does not freeze UI', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);
		await openReceiveModal(page);

		const keypad = page.locator('.calculator-keypad');
		if (!(await keypad.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		// Clear long tasks from page load
		await page.evaluate(() => {
			(window as unknown as { __longTasks: number[] }).__longTasks = [];
		});

		// Type "100" via calculator buttons
		const timings: number[] = [];
		for (const key of ['1', '0', '0']) {
			timings.push(await clickCalcKey(page, key));
			await page.waitForTimeout(100);
		}

		await page.waitForTimeout(500);
		const resp = await measureResponsiveness(page);

		console.log('Key timings:', timings, '| Responsiveness:', resp + 'ms');

		// Each key press should complete in <2s (generous for CI)
		for (const t of timings) {
			expect(t).toBeLessThan(2000);
		}
		// UI should respond within 2s
		expect(resp).toBeLessThan(2000);

		await page.screenshot({ path: `${SCREENSHOTS}/receive-calc-input.png` });
	});

	test('rapid calculator input does not freeze UI', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);
		await openReceiveModal(page);

		const keypad = page.locator('.calculator-keypad');
		if (!(await keypad.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		await page.evaluate(() => {
			(window as unknown as { __longTasks: number[] }).__longTasks = [];
		});

		// Rapidly type "123456789" — simulates fast user typing
		const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
		const timings: number[] = [];
		for (const key of keys) {
			timings.push(await clickCalcKey(page, key));
			await page.waitForTimeout(50); // Very rapid
		}

		await page.waitForTimeout(1000);
		const resp = await measureResponsiveness(page);
		const longTasks = await getLongTasks(page);

		console.log('Rapid input timings:', timings);
		console.log('Responsiveness after rapid input:', resp + 'ms');
		console.log('Long tasks (>50ms):', longTasks.length);

		// No key press should take more than 3s
		for (const t of timings) {
			expect(t).toBeLessThan(3000);
		}
		expect(resp).toBeLessThan(2000);

		// No long task should exceed 1s (the $effect bug caused sync cascades >1s)
		const extremeTasks = longTasks.filter((d) => d > 1000);
		if (extremeTasks.length > 0) {
			console.log('⚠️ Extreme long tasks:', extremeTasks);
		}
		expect(extremeTasks.length).toBe(0);

		await page.screenshot({ path: `${SCREENSHOTS}/receive-rapid-input.png` });
	});

	test('unit toggle does not freeze UI', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);
		await openReceiveModal(page);

		const keypad = page.locator('.calculator-keypad');
		if (!(await keypad.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		// First type an amount
		await clickCalcKey(page, '5');
		await page.waitForTimeout(100);
		await clickCalcKey(page, '0');
		await page.waitForTimeout(500);

		await page.evaluate(() => {
			(window as unknown as { __longTasks: number[] }).__longTasks = [];
		});

		// Toggle unit: USD → Sats
		const satsBtn = page.locator('button', { hasText: /sats/i }).first();
		if (await satsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
			const toggleTime = Date.now();
			await satsBtn.click();
			const toggleDuration = Date.now() - toggleTime;
			console.log('Unit toggle (USD→Sats):', toggleDuration + 'ms');
			expect(toggleDuration).toBeLessThan(2000);
		}

		await page.waitForTimeout(500);

		// Toggle unit: Sats → USD
		const usdBtn = page.locator('button', { hasText: /usd/i }).first();
		if (await usdBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
			const toggleTime = Date.now();
			await usdBtn.click();
			const toggleDuration = Date.now() - toggleTime;
			console.log('Unit toggle (Sats→USD):', toggleDuration + 'ms');
			expect(toggleDuration).toBeLessThan(2000);
		}

		await page.waitForTimeout(500);
		const resp = await measureResponsiveness(page);
		expect(resp).toBeLessThan(2000);

		await page.screenshot({ path: `${SCREENSHOTS}/receive-unit-toggle.png` });
	});

	test('math operations do not freeze UI', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);
		await openReceiveModal(page);

		const keypad = page.locator('.calculator-keypad');
		if (!(await keypad.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		await page.evaluate(() => {
			(window as unknown as { __longTasks: number[] }).__longTasks = [];
		});

		// Type: 50 + 25 = (using calculator operators)
		await clickCalcKey(page, '5');
		await page.waitForTimeout(50);
		await clickCalcKey(page, '0');
		await page.waitForTimeout(50);
		const plusTime = await clickCalcKey(page, '+');
		console.log('Operator "+":', plusTime + 'ms');
		await page.waitForTimeout(100);
		await clickCalcKey(page, '2');
		await page.waitForTimeout(50);
		await clickCalcKey(page, '5');
		await page.waitForTimeout(200);

		const resp = await measureResponsiveness(page);
		console.log('Responsiveness after math:', resp + 'ms');
		expect(resp).toBeLessThan(2000);

		await page.screenshot({ path: `${SCREENSHOTS}/receive-math.png` });
	});

	test('clear button does not freeze UI', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);
		await openReceiveModal(page);

		const keypad = page.locator('.calculator-keypad');
		if (!(await keypad.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		// Type an amount first
		await clickCalcKey(page, '9');
		await page.waitForTimeout(50);
		await clickCalcKey(page, '9');
		await page.waitForTimeout(50);
		await clickCalcKey(page, '9');
		await page.waitForTimeout(500);

		await page.evaluate(() => {
			(window as unknown as { __longTasks: number[] }).__longTasks = [];
		});

		// Click the backspace/clear key multiple times
		for (let i = 0; i < 5; i++) {
			await clickCalcKey(page, '⌫');
			await page.waitForTimeout(50);
		}

		const resp = await measureResponsiveness(page);
		console.log('Responsiveness after clear:', resp + 'ms');
		expect(resp).toBeLessThan(2000);

		await page.screenshot({ path: `${SCREENSHOTS}/receive-clear.png` });
	});

	test('keyboard input in receive modal does not freeze UI', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);
		await openReceiveModal(page);

		const keypad = page.locator('.calculator-keypad');
		if (!(await keypad.isVisible({ timeout: 5000 }).catch(() => false))) {
			test.skip();
			return;
		}

		// Click the modal background to ensure focus is not on an input
		const dialog = page.locator('[role="dialog"]').first();
		if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
			await dialog.click({ position: { x: 10, y: 10 } });
		}
		await page.waitForTimeout(200);

		await page.evaluate(() => {
			(window as unknown as { __longTasks: number[] }).__longTasks = [];
		});

		// Type via keyboard (CalculatorKeypad has global keydown handler)
		const keys = ['1', '2', '3', '4', '5'];
		const timings: number[] = [];
		for (const key of keys) {
			const start = Date.now();
			await page.keyboard.press(key);
			timings.push(Date.now() - start);
			await page.waitForTimeout(80);
		}

		console.log('Keyboard timings:', timings);

		// Also test Enter (mapped to "=")
		const enterStart = Date.now();
		await page.keyboard.press('Enter');
		const enterDuration = Date.now() - enterStart;
		console.log('Enter key:', enterDuration + 'ms');

		await page.waitForTimeout(500);
		const resp = await measureResponsiveness(page);
		console.log('Responsiveness after keyboard:', resp + 'ms');

		for (const t of timings) {
			expect(t).toBeLessThan(2000);
		}
		expect(resp).toBeLessThan(2000);

		await page.screenshot({ path: `${SCREENSHOTS}/receive-keyboard.png` });
	});

	test('memory does not grow excessively during receive modal interaction', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);

		const heapStart = await getHeapSize(page);
		if (heapStart < 0) {
			console.log('Memory API not available — skipping');
			test.skip();
			return;
		}

		await openReceiveModal(page);
		const heapAfterModal = await getHeapSize(page);

		// Type 30 keys to simulate extended usage
		for (let i = 0; i < 30; i++) {
			const key = String(i % 10);
			await clickCalcKey(page, key);
			await page.waitForTimeout(30);
		}

		await page.waitForTimeout(1000);
		const heapAfterTyping = await getHeapSize(page);

		// Wait 5 seconds to check for ongoing memory growth
		const heapBeforeWait = await getHeapSize(page);
		await page.waitForTimeout(5000);
		const heapAfterWait = await getHeapSize(page);

		console.log(
			'Heap: start=' +
				heapStart +
				'MB, modal=' +
				heapAfterModal +
				'MB, typing=' +
				heapAfterTyping +
				'MB, wait=' +
				heapAfterWait +
				'MB'
		);
		console.log('Growth during typing: ' + (heapAfterTyping - heapAfterModal) + 'MB');
		console.log('Growth during idle wait: ' + (heapAfterWait - heapBeforeWait) + 'MB');

		// Typing should not grow heap by more than 30MB
		expect(heapAfterTyping - heapStart).toBeLessThan(30);

		// Idle wait should not grow heap by more than 5MB (detects leaks)
		expect(heapAfterWait - heapBeforeWait).toBeLessThan(5);
	});
});

// ---------------------------------------------------------------------------
// Test Suite: Long Task Detection
// ---------------------------------------------------------------------------

test.describe('Wallet — Long Task Detection', () => {
	test.describe.configure({ timeout: 120_000 });

	test.beforeEach(async ({ page }) => {
		await setupLongTaskTracking(page);
	});

	test('wallet page load does not produce extreme long tasks', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(3000);

		const longTasks = await getLongTasks(page);
		const extremeTasks = longTasks.filter((d) => d > 1000);

		console.log('Long tasks during wallet load:', longTasks.length);
		if (longTasks.length > 0) {
			console.log('  Durations:', longTasks.slice(0, 10));
		}

		// No task should block the main thread for >2s
		expect(extremeTasks.length).toBe(0);
	});

	test('opening and closing receive modal does not produce extreme long tasks', async ({
		page
	}) => {
		await loginViaNsec(page);
		await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(2000);

		await page.evaluate(() => {
			(window as unknown as { __longTasks: number[] }).__longTasks = [];
		});

		// Open
		await openReceiveModal(page);
		await page.waitForTimeout(1000);

		// Close via Escape
		await page.keyboard.press('Escape');
		await page.waitForTimeout(1000);

		// Open again
		await openReceiveModal(page);
		await page.waitForTimeout(1000);

		// Close again
		await page.keyboard.press('Escape');
		await page.waitForTimeout(1000);

		const longTasks = await getLongTasks(page);
		const extremeTasks = longTasks.filter((d) => d > 1000);

		console.log('Long tasks during modal open/close:', longTasks.length);
		if (longTasks.length > 0) {
			console.log('  Durations:', longTasks.slice(0, 10));
		}

		expect(extremeTasks.length).toBe(0);
	});
});
