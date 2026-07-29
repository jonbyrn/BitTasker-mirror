/**
 * E2E test: BalanceHistoryService non-archive RPC warning
 *
 * Reproduces the issue where accessing the wallet triggers:
 *   [BalanceHistoryService] Failed to fetch stablecoin balances (non-archive RPC).
 *   Subsequent failures silenced.
 *
 * Uses Playwright route interception to:
 * 1. Mock eth_getBalance with a non-zero balance (so the BalanceHistory component
 *    actually triggers the service call)
 * 2. Abort eth_call requests (simulating non-archive node failure)
 *
 * The fix should ensure no console.warn appears.
 */
import { test, expect } from '../fixtures/cross-browser-auth';

const MOCK_BALANCE_HEX = '0x' + (BigInt(50000) * BigInt(10_000_000_000)).toString(16); // 50000 sats in wei

test.describe('BalanceHistoryService — non-archive RPC warning', () => {
	test('non-archive RPC failure does not produce console.warn', async ({
		authenticatedPage
	}) => {
		const consoleWarnings: string[] = [];
		authenticatedPage.on('console', (msg) => {
			if (msg.type() === 'warning') {
				consoleWarnings.push(msg.text());
			}
		});

		// Intercept RSK RPC calls:
		// - eth_getBalance → return mock non-zero balance (triggers the service)
		// - eth_call → abort (simulates non-archive node failure)
		// - getblocknobytime (Blockscout) → let through (historical block lookup)
		await authenticatedPage.route('**/*public-node.rsk.co**', (route) => {
			const postData = route.request().postData();
			if (postData) {
				if (postData.includes('eth_call')) {
					// Abort eth_call to simulate non-archive node failure
					return route.abort('failed');
				}
				if (postData.includes('eth_getBalance')) {
					// Return mock balance so the BalanceHistory triggers service call
					return route.fulfill({
						status: 200,
						contentType: 'application/json',
						body: JSON.stringify({
							jsonrpc: '2.0',
							id: 1,
							result: MOCK_BALANCE_HEX
						})
					});
				}
			}
			return route.fallback();
		});

		// Also intercept Blockscout API to return historical block numbers
		await authenticatedPage.route('**/*blockscout*/**', (route) => {
			// Return a valid block number response
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					status: '1',
					result: '5000000'
				})
			});
		});

		await authenticatedPage.goto('/dashboard/wallet', {
			waitUntil: 'networkidle',
			timeout: 30000
		});

		// Wait for balance history to trigger and complete
		// (getBalanceChanges has a 20s timeout, but should resolve faster)
		await authenticatedPage.waitForTimeout(15000);

		// Filter for the specific non-archive RPC warning
		const archiveWarnings = consoleWarnings.filter((msg) =>
			msg.includes('Failed to fetch stablecoin balances')
		);

		if (archiveWarnings.length > 0) {
			console.log('WARNING DETECTED:', archiveWarnings);
		}

		// Assert: no non-archive RPC warnings should appear
		expect(archiveWarnings).toHaveLength(0);
	});

	test('page load without interception — no spurious warnings', async ({
		authenticatedPage
	}) => {
		const serviceWarnings: string[] = [];
		authenticatedPage.on('console', (msg) => {
			if (
				msg.type() === 'warning' &&
				msg.text().includes('[BalanceHistoryService]')
			) {
				serviceWarnings.push(msg.text());
			}
		});

		// Normal page load without any interception
		await authenticatedPage.goto('/dashboard/wallet', {
			waitUntil: 'networkidle',
			timeout: 30000
		});

		await authenticatedPage.waitForTimeout(10000);

		// No BalanceHistoryService warnings should appear on a normal page load
		const archiveWarnings = serviceWarnings.filter((msg) =>
			msg.includes('Failed to fetch stablecoin balances')
		);

		expect(archiveWarnings).toHaveLength(0);
	});
});
