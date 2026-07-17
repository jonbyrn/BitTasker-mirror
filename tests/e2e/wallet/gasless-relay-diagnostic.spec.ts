/**
 * Gasless Relay Diagnostic — E2E
 *
 * Reproduces the gasless relay failure by:
 * 1. Seeding the browser with auth credentials
 * 2. Navigating to the wallet page
 * 3. Monitoring ALL network requests and console logs
 * 4. Checking gasless wallet state (walletReady, JWT, address)
 * 5. Attempting a swap and tracing where the gasless path fails
 *
 * This test does NOT mock the relay — it hits the real local NestJS backend.
 */

import { test, expect, type Page, type ConsoleMessage, type Request } from '@playwright/test';

const WALLET_URL = 'http://localhost:3000/wallet';

// Collect all console messages and network requests
let consoleLogs: Array<{ type: string; text: string; timestamp: number }> = [];
let networkRequests: Array<{ url: string; method: string; status: number; body?: string; responseBody?: string; timestamp: number }> = [];

function resetCollections() {
	consoleLogs = [];
	networkRequests = [];
}

function setupMonitoring(page: Page) {
	// Capture ALL console messages
	page.on('console', (msg: ConsoleMessage) => {
		consoleLogs.push({
			type: msg.type(),
			text: msg.text(),
			timestamp: Date.now()
		});
	});

	// Capture page errors (uncaught exceptions)
	page.on('pageerror', (err) => {
		consoleLogs.push({
			type: 'pageerror',
			text: err.message,
			timestamp: Date.now()
		});
	});

	// Capture ALL network requests (not just failed ones)
	page.on('request', (req: Request) => {
		if (req.url().includes('gasless') || req.url().includes('relay') || req.url().includes('localhost:8000')) {
			networkRequests.push({
				url: req.url(),
				method: req.method(),
				status: 0, // will be filled by response
				body: req.postData() ?? undefined,
				timestamp: Date.now()
			});
		}
	});

	page.on('response', async (resp) => {
		const url = resp.url();
		if (url.includes('gasless') || url.includes('relay') || url.includes('localhost:8000')) {
			const existing = networkRequests.find(r => r.url === url && r.status === 0);
			let responseBody: string | undefined;
			try {
				responseBody = await resp.text().catch(() => undefined);
			} catch { /* ignore */ }
			if (existing) {
				existing.status = resp.status();
				existing.responseBody = responseBody;
			} else {
				networkRequests.push({
					url,
					method: resp.request().method(),
					status: resp.status(),
					responseBody,
					timestamp: Date.now()
				});
			}
		}
	});
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Gasless Relay Diagnostic', () => {

	test.beforeEach(async ({ page }) => {
		resetCollections();
		setupMonitoring(page);
	});

	// -------------------------------------------------------------------------
	// Test 1: Check gasless wallet state after page load
	// -------------------------------------------------------------------------
	test('diagnose gasless wallet state after wallet page load', async ({ page }) => {
		// Seed auth
		await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
		await page.evaluate(() => {
			localStorage.setItem('auth_method', 'nsec');
			localStorage.setItem('nostr_login_done', 'true');
			localStorage.setItem('auth_token', 'e2e-test-token-bypass');
			localStorage.setItem('access_token', 'e2e-test-token-bypass');
			localStorage.setItem('CapacitorStorage.access_token', 'e2e-test-token-bypass');
			localStorage.setItem('CapacitorStorage.auth_method', 'nostr');
			localStorage.setItem('onboardingCompleted', 'true');
			localStorage.setItem('CapacitorStorage.onboardingCompleted', 'true');
			localStorage.setItem('__E2E_NSEC__', 'nsec1ljqmrqvkjjgd46yzd66nzpzgznghyfpcvs4nxk6j5jg2mxvs7r8qjyefh3');
			localStorage.setItem('CapacitorStorage.__E2E_NSEC__', 'nsec1ljqmrqvkjjgd46yzd66nzpzgznghyfpcvs4nxk6j5jg2mxvs7r8qjyefh3');
			localStorage.setItem('__E2E_MNEMONIC__', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
			localStorage.setItem('CapacitorStorage.__E2E_MNEMONIC__', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
		});

		// Navigate to wallet
		await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

		// Wait for wallet initialization
		await page.waitForTimeout(8000);

		// Check gasless wallet state
		const gaslessState = await page.evaluate(() => {
			// Access the Svelte stores via window.__SVELTE_STORES__ or by importing
			// Since we can't directly import, check localStorage and DOM state
			return {
				authToken: localStorage.getItem('auth_token'),
				accessToken: localStorage.getItem('access_token'),
				nsec: localStorage.getItem('__E2E_NSEC__') ? 'present' : 'missing',
				mnemonic: localStorage.getItem('__E2E_MNEMONIC__') ? 'present' : 'missing',
				onboardingCompleted: localStorage.getItem('onboardingCompleted'),
				// Check if wallet page loaded
				hasWalletContent: document.body.textContent?.includes('Swap') || document.body.textContent?.includes('wallet'),
				// Check for any gasless-related DOM elements
				bodyTextLength: document.body.textContent?.length ?? 0
			};
		});

		console.log('=== GASLESS WALLET STATE ===');
		console.log(JSON.stringify(gaslessState, null, 2));

		// Filter console logs for gasless/wallet init messages
		const gaslessLogs = consoleLogs.filter(l =>
			l.text.includes('gasless') ||
			l.text.includes('wallet-init') ||
			l.text.includes('walletReady') ||
			l.text.includes('permissionless') ||
			l.text.includes('ox') ||
			l.text.includes('Gasless') ||
			l.text.includes('initWallet') ||
			l.text.includes('7702') ||
			l.text.includes('smart account')
		);

		console.log('=== GASLESS CONSOLE LOGS ===');
		for (const log of gaslessLogs) {
			console.log(`[${log.type}] ${log.text}`);
		}

		// Filter for error logs
		const errorLogs = consoleLogs.filter(l => l.type === 'error' || l.type === 'pageerror' || l.type === 'warning');
		console.log('=== ERROR/WARNING LOGS ===');
		for (const log of errorLogs) {
			console.log(`[${log.type}] ${log.text.substring(0, 200)}`);
		}

		// Check network requests to the backend
		const relayRequests = networkRequests.filter(r => r.url.includes('localhost:8000'));
		console.log('=== BACKEND REQUESTS ===');
		for (const req of relayRequests) {
			console.log(`${req.method} ${req.url} → ${req.status}`);
			if (req.responseBody) {
				console.log(`  Response: ${req.responseBody.substring(0, 200)}`);
			}
			if (req.body) {
				console.log(`  Body: ${req.body.substring(0, 200)}`);
			}
		}

		// Verify wallet page loaded
		expect(gaslessState.hasWalletContent).toBeTruthy();
	});

	// -------------------------------------------------------------------------
	// Test 2: Trace the full swap flow with network interception
	// -------------------------------------------------------------------------
	test('trace swap flow — gasless relay calls', async ({ page }) => {
		// Seed auth
		await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
		await page.evaluate(() => {
			localStorage.setItem('auth_method', 'nsec');
			localStorage.setItem('nostr_login_done', 'true');
			localStorage.setItem('auth_token', 'e2e-test-token-bypass');
			localStorage.setItem('access_token', 'e2e-test-token-bypass');
			localStorage.setItem('CapacitorStorage.access_token', 'e2e-test-token-bypass');
			localStorage.setItem('CapacitorStorage.auth_method', 'nostr');
			localStorage.setItem('onboardingCompleted', 'true');
			localStorage.setItem('CapacitorStorage.onboardingCompleted', 'true');
			localStorage.setItem('__E2E_NSEC__', 'nsec1ljqmrqvkjjgd46yzd66nzpzgznghyfpcvs4nxk6j5jg2mxvs7r8qjyefh3');
			localStorage.setItem('CapacitorStorage.__E2E_NSEC__', 'nsec1ljqmrqvkjjgd46yzd66nzpzgznghyfpcvs4nxk6j5jg2mxvs7r8qjyefh3');
			localStorage.setItem('__E2E_MNEMONIC__', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
			localStorage.setItem('CapacitorStorage.__E2E_MNEMONIC__', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
		});

		// Navigate to wallet
		await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await page.waitForTimeout(5000);

		// Try to open the swap drawer
		const swapButton = page.locator('button', { hasText: /swap/i }).first();
		const isSwapVisible = await swapButton.isVisible({ timeout: 5000 }).catch(() => false);

		console.log('=== SWAP BUTTON VISIBLE:', isSwapVisible, '===');

		if (isSwapVisible) {
			await swapButton.click();
			await page.waitForTimeout(2000);

			// Check if the swap form opened
			const swapFormVisible = await page.locator('text=Swap assets').isVisible({ timeout: 5000 }).catch(() => false);
			console.log('=== SWAP FORM VISIBLE:', swapFormVisible, '===');

			if (swapFormVisible) {
				// Look for the FROM/TO selectors and amount input
				const fromSelector = page.locator('select, [role="combobox"]').first();
				const amountInput = page.locator('input[type="number"], input[placeholder*="amount"], input[placeholder*="Amount"]').first();

				const hasFromSelector = await fromSelector.isVisible({ timeout: 3000 }).catch(() => false);
				const hasAmountInput = await amountInput.isVisible({ timeout: 3000 }).catch(() => false);

				console.log('=== FORM ELEMENTS ===');
				console.log('From selector visible:', hasFromSelector);
				console.log('Amount input visible:', hasAmountInput);

				if (hasAmountInput) {
					await amountInput.fill('2');
					await page.waitForTimeout(1000);

					// Look for route/quote
					const bodyText = await page.locator('body').textContent() ?? '';
					const hasRoute = bodyText.includes('Boltz') || bodyText.includes('LI.FI') || bodyText.includes('Symbiosis') || bodyText.includes('Uniswap');
					console.log('=== ROUTE VISIBLE:', hasRoute, '===');

					// Look for swap preview/review button
					const previewButton = page.locator('button', { hasText: /preview|review|swap/i }).first();
					const hasPreview = await previewButton.isVisible({ timeout: 5000 }).catch(() => false);
					console.log('=== PREVIEW BUTTON VISIBLE:', hasPreview, '===');

					if (hasPreview) {
						await previewButton.click();
						await page.waitForTimeout(3000);

						// Check for confirmation dialog
						const confirmButton = page.locator('button', { hasText: /confirm/i }).first();
						const hasConfirm = await confirmButton.isVisible({ timeout: 5000 }).catch(() => false);
						console.log('=== CONFIRM BUTTON VISIBLE:', hasConfirm, '===');

						if (hasConfirm) {
							// This is where the swap execution starts — the gasless relay should be called
							await confirmButton.click();
							await page.waitForTimeout(10000);

							// Check for gasless-related logs after swap attempt
							const postSwapLogs = consoleLogs.filter(l =>
								l.text.includes('sendArbitrumTransaction') ||
								l.text.includes('Gasless') ||
								l.text.includes('gasless') ||
								l.text.includes('Falling back') ||
								l.text.includes('walletReady') ||
								l.text.includes('sendGaslessCalls') ||
								l.text.includes('relay') ||
								l.text.includes('UserOp')
							);

							console.log('=== POST-SWAP GASLESS LOGS ===');
							for (const log of postSwapLogs) {
								console.log(`[${log.type}] ${log.text.substring(0, 300)}`);
							}
						}
					}
				}
			}
		}

		// Final summary of ALL gasless-related activity
		console.log('\n=== FINAL SUMMARY ===');
		console.log('Total console logs:', consoleLogs.length);
		console.log('Total backend requests:', networkRequests.length);

		const gaslessNetworkReqs = networkRequests.filter(r =>
			r.url.includes('gasless') || r.url.includes('relay')
		);
		console.log('Gasless relay requests:', gaslessNetworkReqs.length);
		for (const req of gaslessNetworkReqs) {
			console.log(`  ${req.method} ${req.url} → ${req.status}`);
			if (req.responseBody) {
				console.log(`    Response: ${req.responseBody.substring(0, 300)}`);
			}
		}

		const allErrors = consoleLogs.filter(l =>
			l.type === 'error' || l.type === 'pageerror'
		);
		console.log('Total errors:', allErrors.length);
		for (const err of allErrors) {
			console.log(`  [${err.type}] ${err.text.substring(0, 300)}`);
		}
	});

	// -------------------------------------------------------------------------
	// Test 3: Direct gasless relay call from browser context
	// -------------------------------------------------------------------------
	test('direct gasless relay call from browser', async ({ page }) => {
		await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
		await page.evaluate(() => {
			localStorage.setItem('auth_token', 'e2e-test-token-bypass');
			localStorage.setItem('access_token', 'e2e-test-token-bypass');
			localStorage.setItem('__E2E_NSEC__', 'nsec1ljqmrqvkjjgd46yzd66nzpzgznghyfpcvs4nxk6j5jg2mxvs7r8qjyefh3');
			localStorage.setItem('__E2E_MNEMONIC__', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
			localStorage.setItem('onboardingCompleted', 'true');
			localStorage.setItem('CapacitorStorage.onboardingCompleted', 'true');
			localStorage.setItem('CapacitorStorage.__E2E_NSEC__', 'nsec1ljqmrqvkjjgd46yzd66nzpzgznghyfpcvs4nxk6j5jg2mxvs7r8qjyefh3');
			localStorage.setItem('CapacitorStorage.__E2E_MNEMONIC__', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
		});

		await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await page.waitForTimeout(8000);

		// Directly test the gasless relay from the browser context
		const result = await page.evaluate(async () => {
			const logs: string[] = [];

			try {
				// Step 1: Check JWT
				const jwt = localStorage.getItem('auth_token') || '';
				logs.push(`JWT: ${jwt ? 'present (' + jwt.length + ' chars)' : 'MISSING'}`);

				// Step 2: Try to import gasless-store
				let gaslessStore: any;
				try {
					gaslessStore = await import('/src/lib/wallet/gasless-store.ts');
					logs.push('gasless-store imported OK');
				} catch (e) {
					logs.push(`gasless-store import FAILED: ${(e as Error).message}`);
					return { logs, error: 'gasless-store import failed' };
				}

				// Step 3: Check walletReady
				const { get } = await import('svelte/store');
				const isReady = get(gaslessStore.walletReady);
				logs.push(`walletReady: ${isReady}`);

				// Step 4: Check gasless wallet state
				const walletState = get(gaslessStore.gaslessWallet ?? gaslessStore.walletState);
				logs.push(`wallet state: ${JSON.stringify({
					ready: walletState?.ready,
					address: walletState?.address ? walletState.address.substring(0, 10) + '...' : 'null',
					loading: walletState?.loading,
					error: walletState?.error,
					hasAccount: !!walletState?.account,
					hasOwnerKey: !!walletState?.ownerKey
				})}`);

				// Step 5: Try to call sendGaslessCalls with a dummy call
				if (isReady && jwt) {
					try {
						const { USDT0_ADDRESS, FEE_BUFFER_MIN } = await import('/src/lib/wallet/gasless.config.ts');
						const feeToken = USDT0_ADDRESS;
						const feeBuffer = FEE_BUFFER_MIN[feeToken.toLowerCase()] ?? 10_000n;
						logs.push(`feeToken: ${feeToken}, feeBuffer: ${feeBuffer.toString()}`);

						// This will actually call the relay
						const txHash = await gaslessStore.sendGaslessCalls(
							[{ to: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', data: '0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f2bd18000000000000000000000000000000000000000000000000000000000000f4240', value: 0n }],
							feeToken,
							feeBuffer,
							jwt
						);
						logs.push(`sendGaslessCalls SUCCESS: ${txHash}`);
					} catch (e) {
						logs.push(`sendGaslessCalls FAILED: ${(e as Error).message}`);
						logs.push(`Error stack: ${(e as Error).stack?.substring(0, 500)}`);
					}
				} else {
					logs.push('Skipping sendGaslessCalls — not ready or no JWT');
				}

				return { logs, error: null };
			} catch (e) {
				logs.push(`UNEXPECTED ERROR: ${(e as Error).message}`);
				return { logs, error: (e as Error).message };
			}
		});

		console.log('=== DIRECT GASLESS RELAY TEST ===');
		for (const log of result.logs) {
			console.log(`  ${log}`);
		}
		if (result.error) {
			console.log('ERROR:', result.error);
		}

		// Also print all captured console logs during this test
		console.log('\n=== ALL CONSOLE LOGS DURING TEST ===');
		for (const log of consoleLogs) {
			console.log(`[${log.type}] ${log.text.substring(0, 300)}`);
		}

		console.log('\n=== ALL NETWORK REQUESTS ===');
		for (const req of networkRequests) {
			console.log(`${req.method} ${req.url} → ${req.status}`);
			if (req.responseBody) {
				console.log(`  Response: ${req.responseBody.substring(0, 300)}`);
			}
		}
	});
});
