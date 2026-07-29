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
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WALLET_URL = 'http://localhost:3000/wallet';
const SEED_PATH = join(__dirname, '..', '.auth', 'test-seed.json');
const SEED = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));

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
		// Capture the relay payload to verify signature
		let relayPayload = null;
		await page.route('**/gasless/relay', (route) => {
			const body = route.request().postData();
			if (body) {
				try { relayPayload = JSON.parse(body); } catch { /* ignore */ }
			}
			// Return a mock success so the test doesn't hang
			route.fulfill({ status: 200, body: JSON.stringify({ userOpHash: '0xMockHash' }), contentType: 'application/json' });
		});
		// Mock simulate to always succeed (we want to test signing, not balance)
		await page.route('**/gasless/simulate', (route) => {
			route.fulfill({ status: 200, body: JSON.stringify({ success: true }), contentType: 'application/json' });
		});
		// Mock Arbitrum RPC for provider calls (getCode, getTransactionCount)
		await page.route('https://arb1.arbitrum.io/**', (route) => {
			const body = route.request().postDataJSON();
			const method = body?.method;
			if (method === 'eth_getCode') {
				route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x' }), contentType: 'application/json' });
			} else if (method === 'eth_getTransactionCount') {
				route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x0' }), contentType: 'application/json' });
			} else if (method === 'eth_chainId') {
				route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0xa4b1' }), contentType: 'application/json' });
			} else {
				route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body?.id || 1, result: '0x' }), contentType: 'application/json' });
			}
		});

		// Mock notification-center to prevent auth cascade
		await page.route('**/notification-center/**', (route) => {
			route.fulfill({ status: 200, body: JSON.stringify({ unreadCount: 0 }), contentType: 'application/json' });
		});
		// Mock auth refresh
		await page.route('**/auth/refresh', (route) => {
			route.fulfill({ status: 200, body: JSON.stringify({ access_token: SEED.access_token, refresh_token: SEED.refresh_token }), contentType: 'application/json' });
		});

		await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
		await page.evaluate((s) => {
			localStorage.setItem('auth_token', s.access_token);
			localStorage.setItem('access_token', s.access_token);
			localStorage.setItem('refresh_token', s.refresh_token);
			localStorage.setItem('CapacitorStorage.access_token', s.access_token);
			localStorage.setItem('CapacitorStorage.refresh_token', s.refresh_token);
			localStorage.setItem('__E2E_NSEC__', s.nsec);
			localStorage.setItem('__E2E_MNEMONIC__', s.mnemonic);
			localStorage.setItem('onboardingCompleted', 'true');
			localStorage.setItem('CapacitorStorage.onboardingCompleted', 'true');
			localStorage.setItem('CapacitorStorage.__E2E_NSEC__', s.nsec);
			localStorage.setItem('CapacitorStorage.__E2E_MNEMONIC__', s.mnemonic);
		}, SEED);

		// First navigation triggers HMR for changed files
		await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await page.waitForTimeout(3000);
		// Reload to pick up HMR-updated code and get a clean store initialization
		await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
		await page.waitForTimeout(12000);

		const result = await page.evaluate(async () => {
			const logs: string[] = [];

			try {
				// Step 1: Check JWT
				const jwt = localStorage.getItem('auth_token') || '';
				logs.push(`JWT: ${jwt ? 'present (' + jwt.length + ' chars)' : 'MISSING'}`);

				// Step 2: Try to import gasless-store
				let gaslessStore;
				try {
					gaslessStore = await import('/src/lib/wallet/gasless-store.ts');
					logs.push('gasless-store imported OK');
				} catch (e) {
					logs.push(`gasless-store import FAILED: ${(e as Error).message}`);
					return { logs, error: 'gasless-store import failed' };
				}

				// Step 3: Check wallet state by reading the store directly
				// (can't import svelte/store in page.evaluate, use the store's getSnapshot)
				let walletState;
				try {
					// gaslessWallet is a Svelte writable store — subscribe once to read
					let snapshot = null;
					const unsub = gaslessStore.gaslessWallet.subscribe((v) => { snapshot = v; });
					unsub();
					walletState = snapshot;
				} catch (e) {
					logs.push(`wallet state read FAILED: ${(e as Error).message}`);
				}

				const isReady = walletState?.ready ?? false;
				logs.push(`walletReady: ${isReady}`);
				logs.push(`wallet state: ${JSON.stringify({
					ready: walletState?.ready,
					address: walletState?.address ? walletState.address.substring(0, 10) + '...' : 'null',
					loading: walletState?.loading,
					error: walletState?.error,
					hasAccount: !!walletState?.account,
					hasOwnerKey: !!walletState?.ownerKey
				})}`);

				// Step 4: Try to call sendGaslessCalls with a dummy call
				if (isReady && jwt) {
					try {
						const gaslessConfig = await import('/src/lib/wallet/gasless.config.ts');
						const feeToken = gaslessConfig.USDT0_ADDRESS;
						const feeBuffer = gaslessConfig.FEE_BUFFER_MIN?.[feeToken.toLowerCase()] ?? 10_000n;
						logs.push(`feeToken: ${feeToken}, feeBuffer: ${feeBuffer.toString()}`);

						// Pre-encoded ERC-20 transfer(recipient, 1000000) — 1 USDT0 (6 decimals)
						// Selector: 0xa9059cbb, recipient: walletState.address, amount: 1000000 (0x0f4240)
						const paddedAddr = walletState.address.toLowerCase().replace('0x', '').padStart(64, '0');
						const transferData = '0xa9059cbb' + paddedAddr + '00000000000000000000000000000000000000000000000000000000000f4240';
						logs.push(`transferData: ${transferData.length - 2} hex chars, even: ${(transferData.length - 2) % 2 === 0}`);

						// This will actually call the relay — the gasless-store internally
						// uses ethers for ABI encoding and signing
						// Add diagnostic logging around the signing step
						const origSign = walletState.account?.signUserOperation;
						logs.push(`account.signUserOperation type: ${typeof origSign}`);
						logs.push(`account keys: ${Object.keys(walletState.account || {}).join(', ')}`);
						if (walletState.account?.signUserOperation) {
							try {
								// Test sign directly with a minimal UserOp
								const testOp = {
									sender: walletState.address,
									nonce: 0n,
									callData: '0x',
									callGasLimit: 100000n,
									verificationGasLimit: 50000n,
									preVerificationGas: 10000n,
									maxFeePerGas: 1000000000n,
									maxPriorityFeePerGas: 100000000n,
									paymasterAndData: '0x',
									signature: '0x'
								};
								const testSigned = await walletState.account.signUserOperation(testOp);
								logs.push(`TEST sign result signature: ${testSigned?.signature?.substring(0, 30) || 'null/undefined'}...`);
								logs.push(`TEST sign result signature length: ${testSigned?.signature ? (testSigned.signature.length - 2) / 2 : 0} bytes`);
								logs.push(`TEST sign result keys: ${Object.keys(testSigned || {}).join(', ')}`);
							} catch (signErr) {
								logs.push(`TEST sign FAILED: ${(signErr as Error).message}`);
								logs.push(`TEST sign stack: ${(signErr as Error).stack?.substring(0, 300)}`);
							}
						}

						const txHash = await gaslessStore.sendGaslessCalls(
							[{ to: feeToken, data: transferData, value: 0n }],
							feeToken,
							feeBuffer
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

		// Verify the relay was called and payload has a valid signature
		console.log('\n=== RELAY PAYLOAD VERIFICATION ===');
		if (relayPayload) {
			const sig = relayPayload.userOp?.signature;
			const callDataLen = relayPayload.userOp?.callData?.length;
			const callDataHexLen = callDataLen ? callDataLen - 2 : 0;

			console.log('Relay was called: YES');
			console.log('Sender:', relayPayload.sender);
			console.log('Signature:', sig ? sig.substring(0, 30) + '...' : 'MISSING');
			console.log('Signature length:', sig ? (sig.length - 2) / 2 : 0, 'bytes');
			console.log('Signature is NOT empty 0x:', sig && sig !== '0x' ? 'YES' : 'NO');
			console.log('callData hex chars:', callDataHexLen);
			console.log('callData even-length:', callDataHexLen % 2 === 0 ? 'YES' : 'NO');
			console.log('Has eip7702Auth:', !!relayPayload.eip7702Auth);
			console.log('Has factory:', !!relayPayload.userOp?.factory);
			console.log('nonce:', relayPayload.userOp?.nonce);
			console.log('callGasLimit:', relayPayload.userOp?.callGasLimit);
			console.log('preVerificationGas:', relayPayload.userOp?.preVerificationGas);

			// Assertions
			expect(sig).toBeTruthy();
			expect(sig).not.toBe('0x');
			expect(sig!.length).toBeGreaterThan(10); // at least some hex chars
			expect((sig!.length - 2) % 2).toBe(0); // even-length hex
			expect(callDataHexLen).toBeGreaterThan(0);
			expect(callDataHexLen % 2).toBe(0); // even-length hex
			expect(relayPayload.eip7702Auth).toBeTruthy();
			expect(relayPayload.userOp?.factory).toBe('0x7702000000000000000000000000000000000000');
		} else {
			console.log('Relay was called: NO');
			console.log('ERROR: sendGaslessCalls did not reach the relay endpoint');
		}

		// Also print all captured console logs
		console.log('\n=== ALL CONSOLE LOGS DURING TEST ===');
		for (const log of consoleLogs) {
			console.log(`[${log.type}] ${log.text.substring(0, 300)}`);
		}

		// The relay MUST have been called
		expect(relayPayload).toBeTruthy();
	});
});
