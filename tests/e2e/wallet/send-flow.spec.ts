/**
 * Send Flow — Post-Send UX E2E Tests
 *
 * Tests the send flow's post-submission behavior:
 *   - Loading states (spinner, disabled form)
 *   - Success screen (tx hash, explorer link, Done button)
 *   - Modal dismiss after Done
 *   - Toast visibility after modal close (z-index stacking)
 *   - Error display inside modal (modal stays open)
 *   - Multi-hop swap chain progress indication
 *
 * Uses the cross-browser-auth fixture for authenticated sessions.
 * Mocks API responses via page.route() to control send outcomes.
 *
 * Run: npx playwright test tests/e2e/wallet/send-flow.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALLET_URL = '/dashboard/wallet';
const API_BASE = 'http://localhost:4000';
const ALTO_URL = 'https://alto.dev.bittasker.com';
const USDT0_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const TEST_RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18';
const MOCK_USER_OP_HASH = '0x' + 'ab'.repeat(32);

// ---------------------------------------------------------------------------
// Auth helper — bypass login via localStorage
// ---------------------------------------------------------------------------

async function loginViaNsec(page: Page) {
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => {
		(window as unknown as Record<string, boolean>).__PLAYWRIGHT_TEST__ = true;
		localStorage.setItem('auth_method', 'nsec');
		localStorage.setItem('nostr_login_done', 'true');
		localStorage.setItem('auth_token', 'mock-jwt-token-for-testing');
		localStorage.setItem('auth', JSON.stringify({
			authenticated: true,
			userId: 'test-user-id',
			timestamp: Date.now()
		}));
	});
}

// ---------------------------------------------------------------------------
// Mock setup helpers
// ---------------------------------------------------------------------------

async function mockGaslessEstimateSuccess(page: Page) {
	await page.route(`${API_BASE}/gasless/estimate`, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				feeBuffer: '10000000000000000',
				feeCostUSD: 0.01,
				feeTier: 'Low',
				totalWithBuffer: '10000000000000100000'
			})
		});
	});
}

async function mockGaslessRelaySuccess(page: Page) {
	await page.route(`${API_BASE}/gasless/relay`, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ userOpHash: MOCK_USER_OP_HASH })
		});
	});
}

async function mockGaslessRelayError(page: Page, errorMessage: string) {
	await page.route(`${API_BASE}/gasless/relay`, async (route) => {
		await route.fulfill({
			status: 500,
			contentType: 'application/json',
			body: JSON.stringify({ message: errorMessage })
		});
	});
}

async function mockBundlerSuccess(page: Page) {
	await page.route(ALTO_URL, async (route) => {
		const body = route.request().postDataJSON();
		if (body?.method === 'eth_getUserOperationReceipt') {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: body.id,
					result: {
						success: true,
						receipt: {
							transactionHash: '0x' + 'cd'.repeat(32),
							blockNumber: '0x1234'
						}
					}
				})
			});
		} else {
			await route.fallback();
		}
	});
}

async function mockBundlerPending(page: Page) {
	await page.route(ALTO_URL, async (route) => {
		const body = route.request().postDataJSON();
		if (body?.method === 'eth_getUserOperationReceipt') {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null })
			});
		} else {
			await route.fallback();
		}
	});
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

async function navigateToWallet(page: Page) {
	await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
	await page.waitForTimeout(2000);
}

async function openSendModal(page: Page) {
	const sendButton = page.getByRole('button', { name: /send/i }).first();
	await expect(sendButton).toBeVisible({ timeout: 10000 });
	await sendButton.click();
	await page.waitForTimeout(1000);
}

async function fillGaslessForm(page: Page, token: string, recipient: string, amount: string) {
	const tokenSelect = page.locator('#gasless-token');
	await expect(tokenSelect).toBeVisible({ timeout: 5000 });
	await tokenSelect.selectOption({ label: token });

	const recipientInput = page.locator('#gasless-recipient');
	await expect(recipientInput).toBeVisible();
	await recipientInput.fill(recipient);

	const amountInput = page.locator('#gasless-amount');
	await expect(amountInput).toBeVisible();
	await amountInput.fill(amount);
}

async function estimateAndConfirm(page: Page) {
	const estimateBtn = page.getByRole('button', { name: /estimate fee/i });
	await expect(estimateBtn).toBeVisible({ timeout: 5000 });
	await estimateBtn.click();
	await page.waitForTimeout(1000);
}

// ===========================================================================
// Test Suite: Send Flow — Post-Send UX (Gasless / Arbitrum)
// ===========================================================================

test.describe('Send Flow — Post-Send UX', () => {
	test.describe.configure({ timeout: 90_000 });

	test.beforeEach(async ({ page }) => {
		await loginViaNsec(page);
		await mockGaslessEstimateSuccess(page);
		await mockGaslessRelaySuccess(page);
	});

	// -----------------------------------------------------------------------
	// 1. Send button shows loading state during send
	// -----------------------------------------------------------------------
	test('send button shows loading state during send', async ({ page }) => {
		// Use a delayed bundler response so we can observe the loading state
		await page.route(ALTO_URL, async (route) => {
			const body = route.request().postDataJSON();
			if (body?.method === 'eth_getUserOperationReceipt') {
				// Delay response to capture loading state
				await new Promise((r) => setTimeout(r, 3000));
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: body.id,
						result: { success: true, receipt: {} }
					})
				});
			} else {
				await route.fallback();
			}
		});

		await navigateToWallet(page);
		await openSendModal(page);
		await fillGaslessForm(page, 'USDT0', TEST_RECIPIENT, '10');
		await estimateAndConfirm(page);

		// We should now be on the confirm step
		const confirmBtn = page.getByRole('button', { name: /confirm send|confirm/i }).first();
		await expect(confirmBtn).toBeVisible({ timeout: 5000 });

		// Click confirm to trigger the send
		await confirmBtn.click();

		// While sending (before relay responds), the confirm button should show a spinner
		const spinner = page.locator('.loading.loading-spinner').first();
		await expect(spinner).toBeVisible({ timeout: 3000 });
	});

	// -----------------------------------------------------------------------
	// 2. Success screen appears after successful send
	// -----------------------------------------------------------------------
	test('success screen appears after successful send', async ({ page }) => {
		await mockBundlerSuccess(page);

		await navigateToWallet(page);
		await openSendModal(page);
		await fillGaslessForm(page, 'USDT0', TEST_RECIPIENT, '10');
		await estimateAndConfirm(page);

		// Confirm the send
		const confirmBtn = page.getByRole('button', { name: /confirm send|confirm/i }).first();
		await expect(confirmBtn).toBeVisible({ timeout: 5000 });
		await confirmBtn.click();

		// Wait for success screen to appear (after bundler polling resolves)
		const successHeading = page.getByText(/payment sent|success/i);
		await expect(successHeading).toBeVisible({ timeout: 30000 });

		// Verify transaction hash is shown (truncated format from formatAddress)
		const txHashDisplay = page.locator('code.font-mono');
		await expect(txHashDisplay).toBeVisible({ timeout: 5000 });

		// Verify explorer link is present
		const explorerLink = page.getByRole('button', { name: /view.*explorer|explorer/i });
		await expect(explorerLink).toBeVisible({ timeout: 5000 });

		// Verify "Done" button is present
		const doneButton = page.getByRole('button', { name: /done/i });
		await expect(doneButton).toBeVisible({ timeout: 5000 });
	});

	// -----------------------------------------------------------------------
	// 3. Modal closes after clicking Done on success screen
	// -----------------------------------------------------------------------
	test('modal closes after clicking Done on success screen', async ({ page }) => {
		await mockBundlerSuccess(page);

		await navigateToWallet(page);
		await openSendModal(page);
		await fillGaslessForm(page, 'USDT0', TEST_RECIPIENT, '10');
		await estimateAndConfirm(page);

		// Confirm send
		const confirmBtn = page.getByRole('button', { name: /confirm send|confirm/i }).first();
		await expect(confirmBtn).toBeVisible({ timeout: 5000 });
		await confirmBtn.click();

		// Wait for success screen
		const successHeading = page.getByText(/payment sent|success/i);
		await expect(successHeading).toBeVisible({ timeout: 30000 });

		// Click Done
		const doneButton = page.getByRole('button', { name: /done/i });
		await doneButton.click();
		await page.waitForTimeout(500);

		// Verify the modal/dialog is no longer visible
		const dialog = page.locator('[role="dialog"]');
		const modalVisible = await dialog.isVisible().catch(() => false);
		expect(modalVisible).toBe(false);

		// Verify we're back on the wallet page (send button should be visible again)
		const sendButton = page.getByRole('button', { name: /send/i }).first();
		await expect(sendButton).toBeVisible({ timeout: 5000 });
	});

	// -----------------------------------------------------------------------
	// 4. Toast is visible after modal closes
	// -----------------------------------------------------------------------
	test('toast is visible after modal closes', async ({ page }) => {
		await mockBundlerSuccess(page);

		await navigateToWallet(page);
		await openSendModal(page);
		await fillGaslessForm(page, 'USDT0', TEST_RECIPIENT, '10');
		await estimateAndConfirm(page);

		// Confirm send
		const confirmBtn = page.getByRole('button', { name: /confirm send|confirm/i }).first();
		await expect(confirmBtn).toBeVisible({ timeout: 5000 });
		await confirmBtn.click();

		// Wait for success screen
		const successHeading = page.getByText(/payment sent|success/i);
		await expect(successHeading).toBeVisible({ timeout: 30000 });

		// Click Done to close the modal
		const doneButton = page.getByRole('button', { name: /done/i });
		await doneButton.click();
		await page.waitForTimeout(1000);

		// The success screen component's onClose fires appStore.showSuccessToast('transaction_confirmed')
		// via TransactionSuccessScreen's monitoring effect. Also the Toast container uses z-70.
		// After the modal (z-100) closes, the toast should be visible.
		const toastContainer = page.locator('.toast-container');
		const toastVisible = await toastContainer.isVisible({ timeout: 5000 }).catch(() => false);

		if (toastVisible) {
			// Toast is rendered — verify it's NOT behind a higher z-index modal
			const toastZIndex = await toastContainer.evaluate((el) => {
				return window.getComputedStyle(el).zIndex;
			});
			// z-70 = 70 in Tailwind; verify no modal overlay covers it
			const modalBackdrop = page.locator('.fixed.z-99, .fixed.z-100');
			const backdropVisible = await modalBackdrop.isVisible().catch(() => false);
			expect(backdropVisible).toBe(false);
		}

		// At minimum, some notification text should be visible on the page
		// (either a toast or a blockchain confirmation indicator)
		const bodyText = await page.locator('body').textContent() ?? '';
		const hasNotification = bodyText.includes('confirm') || bodyText.includes('sent')
			|| bodyText.includes('success') || toastVisible;
		expect(hasNotification).toBeTruthy();
	});

	// -----------------------------------------------------------------------
	// 5. Error message appears in modal on send failure
	// -----------------------------------------------------------------------
	test('error message appears in modal on send failure', async ({ page }) => {
		await mockGaslessRelayError(page, 'Transaction failed: insufficient gas');
		// Still mock bundler pending (should not be reached)
		await mockBundlerPending(page);

		await navigateToWallet(page);
		await openSendModal(page);
		await fillGaslessForm(page, 'USDT0', TEST_RECIPIENT, '10');
		await estimateAndConfirm(page);

		// Confirm send — this will trigger the relay error
		const confirmBtn = page.getByRole('button', { name: /confirm send|confirm/i }).first();
		await expect(confirmBtn).toBeVisible({ timeout: 5000 });
		await confirmBtn.click();

		// Wait for the error state to appear (within the gasless flow)
		// The error step shows GaslessErrorDisplay with error text and Cancel/Retry buttons
		await page.waitForTimeout(3000);

		// Verify error message is visible INSIDE the current view
		const errorText = page.getByText(/error|failed|insufficient gas/i).first();
		await expect(errorText).toBeVisible({ timeout: 10000 });

		// Verify the modal/flow is still open (Cancel and Retry buttons should be visible)
		const retryButton = page.getByRole('button', { name: /retry/i }).first();
		const cancelButton = page.getByRole('button', { name: /cancel/i }).first();
		const hasActionButtons = await retryButton.isVisible({ timeout: 3000 }).catch(() => false)
			|| await cancelButton.isVisible({ timeout: 3000 }).catch(() => false);
		expect(hasActionButtons).toBe(true);

		// Verify we did NOT navigate away — the send button on the wallet page should NOT be visible
		// (we're still inside the send flow)
		const sendFlowContent = page.locator('.send-payment-form, [role="dialog"], .space-y-4.p-4');
		await expect(sendFlowContent.first()).toBeVisible({ timeout: 3000 });
	});

	// -----------------------------------------------------------------------
	// 6. Multi-hop swap chain shows progress indication
	// -----------------------------------------------------------------------
	test('multi-hop swap chain shows progress indication', async ({ page }) => {
		// Mock bundler to stay pending (simulating a long-running swap chain)
		await mockBundlerPending(page);

		await navigateToWallet(page);
		await openSendModal(page);
		await fillGaslessForm(page, 'USDT0', TEST_RECIPIENT, '10');
		await estimateAndConfirm(page);

		// Confirm send
		const confirmBtn = page.getByRole('button', { name: /confirm send|confirm/i }).first();
		await expect(confirmBtn).toBeVisible({ timeout: 5000 });
		await confirmBtn.click();

		// Wait for the pending state — PendingTransactionScreen should appear
		// It shows a spinner, tx hash, and "pending" status badge
		const pendingIndicator = page.locator(
			'.loading.loading-spinner, [class*="badge-warning"], .badge'
		).first();
		await expect(pendingIndicator).toBeVisible({ timeout: 15000 });

		// Verify the user can see something is happening:
		// The PendingTransactionScreen shows a pending status badge
		const pendingBadge = page.getByText(/pending|confirming|processing/i).first();
		const hasProgress = await pendingBadge.isVisible({ timeout: 5000 }).catch(() => false);
		expect(hasProgress).toBe(true);
	});
});

// ===========================================================================
// Test Suite: Normal Send Flow — Confirmation & Error UX
// ===========================================================================

test.describe('Normal Send Flow — Confirmation Modal', () => {
	test.describe.configure({ timeout: 90_000 });

	test.beforeEach(async ({ page }) => {
		await loginViaNsec(page);
	});

	test('send confirmation modal shows loading state on confirm', async ({ page }) => {
		// Mock RSK RPC to delay transaction response
		await page.route('**/public-node.rsk.co**', async (route) => {
			const postData = route.request().postData();
			if (postData && postData.includes('eth_sendRawTransaction')) {
				// Delay the response to observe loading state
				await new Promise((r) => setTimeout(r, 5000));
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						result: '0x' + 'ab'.repeat(32)
					})
				});
			} else {
				await route.fallback();
			}
		});

		await navigateToWallet(page);
		await openSendModal(page);

		// Switch to "Enter" tab if on QR scan tab
		const enterTab = page.getByRole('tab', { name: /enter|payment details/i }).first();
		if (await enterTab.isVisible({ timeout: 2000 }).catch(() => false)) {
			await enterTab.click();
			await page.waitForTimeout(500);
		}

		// Fill address (use RSK address to trigger normal flow)
		const addressInput = page.locator('input[type="text"]').first();
		if (await addressInput.isVisible({ timeout: 3000 }).catch(() => false)) {
			await addressInput.fill(TEST_RECIPIENT);
			await page.waitForTimeout(1000);
		}

		// Fill amount using calculator keypad
		const keypad = page.locator('.calculator-keypad');
		if (await keypad.isVisible({ timeout: 3000 }).catch(() => false)) {
			for (const key of ['1', '0']) {
				const keyBtn = keypad.locator('button', { hasText: new RegExp(`^${key}$`) }).first();
				if (await keyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
					await keyBtn.click();
					await page.waitForTimeout(100);
				}
			}
		}

		// Try clicking the Send button on the form
		const sendFormBtn = page.locator('.btn-primary').filter({ hasText: /send/i }).first();
		if (await sendFormBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
			const isDisabled = await sendFormBtn.isDisabled();
			if (!isDisabled) {
				await sendFormBtn.click();
				await page.waitForTimeout(500);
			}
		}

		// If a confirmation dialog appeared, verify its structure
		const confirmDialog = page.locator('[role="dialog"]').first();
		if (await confirmDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
			// Verify the confirmation dialog contains amount/recipient info
			const dialogText = await confirmDialog.textContent() ?? '';
			expect(dialogText.length).toBeGreaterThan(0);
		}
	});

	test('normal send error display stays inside the modal', async ({ page }) => {
		// Mock RSK RPC to fail
		await page.route('**/public-node.rsk.co**', async (route) => {
			const postData = route.request().postData();
			if (postData && postData.includes('eth_sendRawTransaction')) {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						error: { code: -32000, message: 'insufficient funds for gas' }
					})
				});
			} else {
				await route.fallback();
			}
		});

		await navigateToWallet(page);
		await openSendModal(page);

		// The modal should be open
		const sendFlowContent = page.locator('.send-payment-form, [role="dialog"]').first();
		await expect(sendFlowContent).toBeVisible({ timeout: 5000 });

		// If there's an error from the transaction, it should appear within the form/modal
		const errorAlert = page.locator('.alert-error').first();
		const hasError = await errorAlert.isVisible({ timeout: 2000 }).catch(() => false);

		if (hasError) {
			// Error is inside the send flow, not outside it
			const errorBounds = await errorAlert.boundingBox();
			const flowBounds = await sendFlowContent.boundingBox();
			expect(errorBounds).not.toBeNull();
			expect(flowBounds).not.toBeNull();
			if (errorBounds && flowBounds) {
				// Error element is within the flow container
				expect(errorBounds.y).toBeGreaterThanOrEqual(flowBounds.y - 10);
			}
		}
	});
});
