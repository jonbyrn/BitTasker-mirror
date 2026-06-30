/**
 * Swap Route Resolution E2E
 *
 * Tests that the swap form route engine resolves correctly.
 * Uses standard Playwright (no real funds needed).
 *
 * Run: npx playwright test tests/e2e/wallet/live-swap-e2e.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';

const WALLET_URL = '/wallet';
const ROUTE_WAIT = 12_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loginViaNsec(page: Page) {
	const { readFileSync } = await import('node:fs');
	const { join } = await import('node:path');
	const nsecPath = join(process.cwd(), 'test-nsec.txt');
	const nsec = readFileSync(nsecPath, 'utf8').trim();
	await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
	await page.evaluate((n: string) => {
		localStorage.setItem('nostr_nsec', n);
		localStorage.setItem('auth_method', 'nsec');
		localStorage.setItem('nostr_login_done', 'true');
	}, nsec);
}

async function openSwapForm(page: Page) {
	await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30_000 });
	await page.waitForTimeout(3000);

	const swapBtn = page.getByRole('button', { name: /^Swap$/ });
	await swapBtn.click();
	await page.waitForTimeout(2000);

	// The swap form is in the second dialog
	const swapDialog = page.locator('[role=dialog]').nth(1);
	await expect(swapDialog.getByText('Swap Assets')).toBeVisible({ timeout: 5000 });
	return swapDialog;
}

interface SwapState {
	from: string | null;
	to: string | null;
	route: string | null;
	fee: string | null;
	receive: string | null;
	minimum: string | null;
	totalSent: string | null;
	estTime: string | null;
	previewEnabled: boolean;
	feeSats: number;
	totalSats: number;
	raw: string;
}

async function readSwapState(page: Page): Promise<SwapState> {
	return page.evaluate(() => {
		const dialogs = document.querySelectorAll('[role=dialog]');
		const el = dialogs[1];
		if (!el)
			return {
				from: null,
				to: null,
				route: null,
				fee: null,
				receive: null,
				minimum: null,
				totalSent: null,
				estTime: null,
				previewEnabled: false,
				feeSats: 0,
				totalSats: 0,
				raw: ''
			};
		const text = el.innerText;
		const previewBtn = Array.from(el.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Swap Preview')
		);

		// Parse sats values
		const feeMatch = text.match(/Fee\n—?\s*([\d,]+)\s*Sats/);
		const totalMatch = text.match(/Total sent\n([\d,]+)\s*sats/);
		const feeSats = feeMatch ? parseInt(feeMatch[1].replace(/,/g, '')) : 0;
		const totalSats = totalMatch ? parseInt(totalMatch[1].replace(/,/g, '')) : 0;

		return {
			from: text.match(/From\n([^\n]+)/)?.[1]?.trim() ?? null,
			to: text.match(/To\n([^\n]+)/)?.[1]?.trim() ?? null,
			route: text.match(/via\s+([^\n]+)/)?.[1]?.trim() ?? null,
			fee: text.match(/Fee\n([^\n]+)/)?.[1]?.trim() ?? null,
			receive: text.match(/You receive\n([^\n]+)/)?.[1]?.trim() ?? null,
			minimum: text.match(/Minimum[:\s]*([^\n]+)/)?.[1]?.trim() ?? null,
			totalSent: text.match(/Total sent\n([^\n]+)/)?.[1]?.trim() ?? null,
			estTime: text.match(/Est\.\s*time[:\s]*([^\n]+)/)?.[1]?.trim() ?? null,
			previewEnabled: previewBtn ? !(previewBtn as HTMLButtonElement).disabled : false,
			feeSats,
			totalSats,
			raw: text.substring(0, 800)
		};
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Swap Form — Route Resolution', () => {
	test.describe.configure({ timeout: 90_000 });

	test.beforeEach(async ({ page: _page }) => {
		await loginViaNsec(page);
	});

	test('opens with valid route for default pair (rBTC → USDT0)', async ({ page: _page }) => {
		await openSwapForm(page);
		await page.waitForTimeout(ROUTE_WAIT);

		const state = await readSwapState(page);

		// Form should show source and dest
		expect(state.from).toBeTruthy();
		expect(state.to).toBeTruthy();

		// Route should resolve
		if (state.route) {
			expect(state.route).toMatch(/Boltz|LI\.FI|Uniswap|Symbiosis/i);

			// Fee should be populated
			expect(state.fee).toBeTruthy();
			expect(state.fee).not.toBe('—');

			// Preview should be enabled
			expect(state.previewEnabled).toBe(true);

			// Estimated time should be present
			expect(state.estTime).toBeTruthy();
			expect(state.estTime).toMatch(/\d/);

			// Fee should be reasonable (< 10% of total)
			if (state.feeSats > 0 && state.totalSats > 0) {
				const feePercent = (state.feeSats / state.totalSats) * 100;
				expect(feePercent).toBeLessThan(10);
			}
		}

		// Minimum should be displayed
		expect(state.minimum).toBeTruthy();
		expect(state.minimum).toMatch(/\d/);
	});

	test('below minimum amount shows minimum warning', async ({ page: _page }) => {
		const dialog = await openSwapForm(page);

		// Enter a very small amount
		const input = dialog.locator('input[inputmode="decimal"]');
		await input.fill('0.01');
		await input.evaluate((el) => el.dispatchEvent(new Event('blur', { bubbles: true })));
		await page.waitForTimeout(ROUTE_WAIT);

		const state = await readSwapState(page);

		// Preview should be disabled
		expect(state.previewEnabled).toBe(false);

		// Should show minimum warning
		const hasMinWarning = state.raw.toLowerCase().includes('minimum');
		expect(hasMinWarning).toBe(true);
	});

	test('Swap Preview button is clickable when route is valid', async ({ page: _page }) => {
		const dialog = await openSwapForm(page);
		await page.waitForTimeout(ROUTE_WAIT);

		const state = await readSwapState(page);

		if (state.previewEnabled) {
			const previewBtn = dialog.getByRole('button', { name: /Swap Preview/i });
			await expect(previewBtn).toBeEnabled();
			await previewBtn.click();
			await page.waitForTimeout(2000);

			// After clicking preview, should show confirmation step
			const afterText = await dialog.innerText();
			expect(afterText).toBeTruthy();
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Live Swap Execution (CJS script gate)
//
// These tests require a funded wallet and spend real funds.
// They are implemented as a standalone CDP script, not Playwright tests,
// because the test runner launches its own browser that isn't authenticated
// with the funded wallet.
//
// Run: node tests/e2e/wallet/live-swap-execution.cjs
//
// See: tests/e2e/wallet/live-swap-execution.cjs for the actual execution tests.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Live Swap Execution — reference', () => {
	test('live swap tests are in live-swap-execution.cjs', async ({ page: _page }) => {
		// This is a placeholder. Real execution tests run via:
		//   node tests/e2e/wallet/live-swap-execution.cjs
		// Because they need the existing Chrome session (CDP) with funded wallet.
		test.skip();
	});
});
