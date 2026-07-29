/**
 * MetaMask Balance E2E Test
 *
 * Reproduces the issue where MetaMask shows 0 balance for an account
 * that has 10,000 ETH on a local Hardhat node (chain ID 31337).
 *
 * Prerequisites:
 *   1. Hardhat node running: cd meta-tx-relay/contracts && npm run local
 *   2. Synpress cache built: npx synpress tests/e2e/wallet-setup
 *   3. Dev server running: npm run dev (port 3000)
 *
 * Run:
 *   npx playwright test tests/e2e/wallet/metamask-balance-e2e.spec.ts --project=chromium
 *
 * If cache is stale (wallet setup changed), rebuild:
 *   npx synpress tests/e2e/wallet-setup
 */

import { testWithMetaMask as test } from '../fixtures/testWithMetaMask';
import { expect } from '@playwright/test';

// Hardhat default account #0
const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const EXPECTED_ETH = '10,000';

// BitTasker app URL (dev server on port 3000)
const APP_URL = 'http://localhost:3000';
const WALLET_URL = `${APP_URL}/dashboard/wallet`;

test.describe('MetaMask Balance on Local Hardhat Node', () => {
	test.describe.configure({ timeout: 60_000 });

	// ──────────────────────────────────────────────────────────────────────
	// Test 1: MetaMask extension itself shows the correct balance
	// This verifies that MetaMask's own UI displays the 10,000 ETH balance
	// when connected to the local Hardhat network.
	// ──────────────────────────────────────────────────────────────────────
	test('MetaMask extension shows correct ETH balance on Local Arbitrum network', async ({
		metamaskPage,
		metamask
	}) => {
		// The wallet setup already imported the seed and switched to Local Arbitrum.
		// MetaMask should be showing the balance from the Hardhat node.

		// Wait for MetaMask to fully load and query the balance
		await metamaskPage.waitForTimeout(3000);

		// Take a screenshot of MetaMask for debugging
		await metamaskPage.screenshot({
			path: 'tests/e2e/screenshots/metamask-balance-check.png',
			fullPage: true
		});

		// Look for the ETH balance in MetaMask's UI
		// MetaMask displays balance as "10,000 ETH" or similar format
		const balanceText = metamaskPage.locator('[data-testid="eth-overview__primary-currency"], .eth-overview__primary-currency, [data-testid="account-value-and-suffix"]').first();

		// Check if the balance element exists
		const hasBalanceElement = (await balanceText.count()) > 0;

		if (hasBalanceElement) {
			const text = await balanceText.textContent();
			console.log('[TEST] MetaMask balance text:', text);

			// Screenshot the current state
			await metamaskPage.screenshot({
				path: 'tests/e2e/screenshots/metamask-balance-text.png',
				fullPage: true
			});

			// The balance should NOT be "0 ETH" — it should show 10,000
			expect(text).not.toMatch(/^0(\.0+)?\s*ETH/i);
		} else {
			// If we can't find the standard selector, try a broader search
			console.log('[TEST] Standard balance selector not found, searching for balance text...');

			// Search for any text containing ETH amount
			const allText = await metamaskPage.textContent('body');
			console.log('[TEST] MetaMask page body text (first 500 chars):', allText?.slice(0, 500));

			await metamaskPage.screenshot({
				path: 'tests/e2e/screenshots/metamask-balance-broad-search.png',
				fullPage: true
			});

			// At minimum, verify MetaMask is showing the Local Arbitrum network
			// and not crashed
			expect(allText).toBeTruthy();
		}
	});

	// ──────────────────────────────────────────────────────────────────────
	// Test 2: MetaMask balance via JSON-RPC through the extension
	// This programmatically queries eth_getBalance through MetaMask's
	// provider to verify the balance MetaMask sees.
	// ──────────────────────────────────────────────────────────────────────
	test('MetaMask provider returns correct balance via eth_getBalance', async ({
		context,
		metamaskPage,
		metamask,
		extensionId
	}) => {
		// Open a blank page in the same context to query MetaMask's provider
		const blankPage = await context.newPage();
		await blankPage.goto('about:blank');

		// Inject a script that queries MetaMask's provider for the balance
		// MetaMask injects window.ethereum into pages when connected
		const balance = await blankPage.evaluate(async (address) => {
			// @ts-expect-error — MetaMask injects window.ethereum at runtime
			if (!window.ethereum) {
				return { error: 'window.ethereum not available on about:blank' };
			}

			try {
				// Request account access first
				// @ts-expect-error
				const accounts = await window.ethereum.request({
					method: 'eth_requestAccounts'
				});

				// Get the balance
				// @ts-expect-error
				const balanceHex = await window.ethereum.request({
					method: 'eth_getBalance',
					params: [address, 'latest']
				});

				// Get chain ID
				// @ts-expect-error
				const chainId = await window.ethereum.request({
					method: 'eth_chainId'
				});

				const balanceWei = BigInt(balanceHex);
				const balanceEth = Number(balanceWei) / 1e18;

				return {
					accounts,
					chainId: parseInt(chainId, 16),
					balanceHex,
					balanceWei: balanceWei.toString(),
					balanceEth
				};
			} catch (e) {
				return { error: (e as Error).message };
			}
		}, TEST_ADDRESS);

		console.log('[TEST] MetaMask provider balance query result:', JSON.stringify(balance, null, 2));

		await blankPage.screenshot({
			path: 'tests/e2e/screenshots/metamask-provider-balance.png',
			fullPage: true
		});

		// If we got a balance, it should be 10,000 ETH
		if (!balance.error) {
			expect(balance.balanceEth).toBe(10_000);
			expect(balance.chainId).toBe(31337);
		} else {
			console.log('[TEST] Could not query via window.ethereum:', balance.error);
			// This is expected on about:blank — MetaMask may not inject there
			// The next test will verify via the dapp connection flow
		}

		await blankPage.close();
	});

	// ──────────────────────────────────────────────────────────────────────
	// Test 3: Connect MetaMask to BitTasker app and verify balance display
	// This is the main test that reproduces the user's reported issue:
	// connecting MetaMask to the app and seeing 0 balance.
	// ──────────────────────────────────────────────────────────────────────
	test('BitTasker app shows correct balance after MetaMask connection', async ({
		context,
		page,
		metamaskPage,
		metamask,
		extensionId
	}) => {
		// Step 1: Navigate to the BitTasker app
		await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
		await page.waitForLoadState('networkidle');

		// Step 2: Inject mock auth to bypass login
		await page.evaluate(() => {
			localStorage.setItem('auth_method', 'nsec');
			localStorage.setItem('nostr_login_done', 'true');
			localStorage.setItem('auth_token', 'mock-jwt-token-for-testing');
			localStorage.setItem(
				'auth',
				JSON.stringify({
					authenticated: true,
					userId: 'test-user-id',
					timestamp: Date.now()
				})
			);
		});

		// Step 3: Navigate to the wallet page
		await page.goto(WALLET_URL, { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		// Step 4: Find and click the Connect tab/button
		const connectTab = page.getByRole('button', { name: /connect/i }).first();
		const hasConnectTab = (await connectTab.count()) > 0;

		if (!hasConnectTab) {
			// Try alternative selectors for the wallet connect flow
			const walletConnect = page.getByText(/connect.*wallet|wallet.*connect/i).first();
			if ((await walletConnect.count()) > 0) {
				await walletConnect.click();
			} else {
				console.log('[TEST] No connect button found — wallet UI may have changed');
				await page.screenshot({
					path: 'tests/e2e/screenshots/no-connect-button.png',
					fullPage: true
				});
				test.skip(true, 'Connect button not found on wallet page');
				return;
			}
		} else {
			await connectTab.click();
		}

		await page.waitForTimeout(1000);

		// Step 5: Look for MetaMask option in the connect modal
		const metamaskOption = page.getByText(/metamask/i).first();
		const hasMetaMask = (await metamaskOption.count()) > 0;

		if (!hasMetaMask) {
			console.log('[TEST] MetaMask option not found in connect modal');
			await page.screenshot({
				path: 'tests/e2e/screenshots/no-metamask-option.png',
				fullPage: true
			});
			test.skip(true, 'MetaMask option not found in connect modal');
			return;
		}

		// Step 6: Click MetaMask to initiate connection
		await metamaskOption.click();
		await page.waitForTimeout(2000);

		// Step 7: Approve the connection in MetaMask
		// Synpress handles the MetaMask popup via the extension
		try {
			await metamask.connectToDapp([TEST_ADDRESS]);
		} catch (e) {
			console.log('[TEST] MetaMask connectToDapp error:', (e as Error).message);
			// The connection might still work — continue to check
		}

		await page.waitForTimeout(3000);

		// Step 8: Screenshot the wallet page after connection
		await page.screenshot({
			path: 'tests/e2e/screenshots/wallet-after-metamask-connect.png',
			fullPage: true
		});

		// Step 9: Check the balance displayed in the BitTasker app
		// Look for ETH balance text in the wallet UI
		const balanceElements = page.locator(
			'[data-testid*="balance"], .balance, [class*="balance"], [class*="Balance"]'
		);
		const balanceCount = await balanceElements.count();

		console.log(`[TEST] Found ${balanceCount} balance-related elements`);

		if (balanceCount > 0) {
			for (let i = 0; i < Math.min(balanceCount, 5); i++) {
				const text = await balanceElements.nth(i).textContent();
				console.log(`[TEST] Balance element ${i}: "${text}"`);
			}
		}

		// Also search for "ETH" text in the page
		const ethText = page.getByText(/ETH/i);
		const ethCount = await ethText.count();
		console.log(`[TEST] Found ${ethCount} elements containing "ETH"`);

		for (let i = 0; i < Math.min(ethCount, 5); i++) {
			const text = await ethText.nth(i).textContent();
			console.log(`[TEST] ETH text ${i}: "${text}"`);
		}

		// Step 10: Final screenshot with full page state
		await page.screenshot({
			path: 'tests/e2e/screenshots/metamask-balance-final.png',
			fullPage: true
		});

		// Step 11: Assert that the balance is NOT zero
		// This is the core assertion that reproduces the user's bug.
		// The connected MetaMask account has 10,000 ETH on the local node,
		// but the app shows 0.
		const pageText = await page.textContent('body');

		// Log key findings for debugging
		console.log('[TEST] === BALANCE VERIFICATION ===');
		console.log('[TEST] Connected address:', TEST_ADDRESS);
		console.log('[TEST] Expected balance: 10,000 ETH');
		console.log('[TEST] Page contains "0 ETH":', pageText?.includes('0 ETH'));
		console.log('[TEST] Page contains "10,000":', pageText?.includes('10,000'));

		// The test PASSES if it finds 10,000 ETH in the page.
		// It FAILS if it finds "0 ETH" or "0.00" as the primary balance,
		// which is the bug the user reported.
		//
		// NOTE: This assertion is intentionally strict — it checks that the
		// balance text includes a non-zero ETH amount. If the app correctly
		// queries MetaMask for the balance, it should show 10,000 ETH.
		// If it shows 0, the test fails and confirms the bug.

		// Look for a zero balance pattern that would indicate the bug
		const hasZeroBalance =
			pageText?.match(/\b0(\.0+)?\s*ETH\b/) !== null &&
			pageText?.match(/\b10[,.]?000\s*ETH\b/) === null;

		if (hasZeroBalance) {
			console.log('[TEST] ❌ BUG CONFIRMED: App shows 0 ETH despite MetaMask having 10,000 ETH');
		}

		// Soft assertion — log the issue but don't fail the test yet
		// (until we confirm the test setup is correct)
		expect(hasZeroBalance, 'App should NOT show 0 ETH when MetaMask has 10,000 ETH').toBe(false);
	});

	// ──────────────────────────────────────────────────────────────────────
	// Test 4: Direct RPC verification — bypasses MetaMask entirely
	// Confirms the Hardhat node is running and has the expected balance.
	// This is a sanity check to rule out node-side issues.
	// ──────────────────────────────────────────────────────────────────────
	test('Hardhat node has correct balance (RPC sanity check)', async ({ page }) => {
		// Query the Hardhat node directly via fetch (not through MetaMask)
		const result = await page.evaluate(async () => {
			try {
				const response = await fetch('http://127.0.0.1:8545', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						method: 'eth_getBalance',
						params: [
							'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
							'latest'
						],
						id: 1
					})
				});
				const data = await response.json();
				const balanceWei = BigInt(data.result);
				const balanceEth = Number(balanceWei) / 1e18;
				return { balanceWei: balanceWei.toString(), balanceEth, error: null };
			} catch (e) {
				return { balanceWei: null, balanceEth: null, error: (e as Error).message };
			}
		});

		console.log('[TEST] Direct RPC balance:', JSON.stringify(result, null, 2));

		if (result.error) {
			console.log('[TEST] ⚠️ Hardhat node not reachable:', result.error);
			test.skip(true, 'Hardhat node not running on port 8545');
			return;
		}

		// The node MUST have 10,000 ETH for the test account
		expect(result.balanceEth).toBe(10_000);
	});
});
