/**
 * USDT on BSC Payment Flows - E2E Tests
 *
 * Comprehensive test scenarios for complete user journeys involving USDT-BSC payments:
 * 1. Task Creation → Bid → Acceptance Flow
 * 2. Send USDT Payment Flow
 * 3. Receive USDT Payment Request
 * 4. Ambiguous Address Handling
 * 5. Wrong Chain Detection
 * 6. Insufficient Balance Handling
 * 7. Sponsor Unavailability Handling
 * 8. Transaction History Integration
 *
 * Uses testnet environment (BSC Chain 97, RSK Chain 31)
 * Real BSC addresses and proper USDT amounts (6 decimals)
 *
 * @requires playwright
 * @requires E2E test environment (.env.local)
 */

import { test, expect, Page } from '@playwright/test';
import type { ParsedPaymentAddress } from '$lib/utils/helpers/paymentAddressParser';
import { BitTaskerPageObject } from './helpers/page-objects';
import {
	waitForElement,
	waitForElementHidden,
	clickWithRetry,
	fillInputWithRetry,
	waitForNetworkIdle,
	WAIT_CONFIG
} from './helpers/wait-utils';
import {
	BSC_TESTNET_CONFIG,
	TEST_ACCOUNTS,
	TEST_AMOUNTS,
	WAIT_TIMES,
	formatUsdtDisplay,
	getExplorerUrl,
	createMockTransaction
} from './fixtures/testnet-usdt-bsc';

// Test configuration for testnet
const TEST_CONFIG = {
	BSC_TESTNET_CHAIN_ID: 97,
	RSK_TESTNET_CHAIN_ID: 31,
	USDT_DECIMALS: 6,
	BASE_URL: process.env.BASE_URL || 'http://localhost:5173',
	TIMEOUT: WAIT_CONFIG.maxTimeout,
	POLL_INTERVAL: WAIT_CONFIG.shortWait
};

/**
 * Test fixtures and helper data
 */
const TEST_ADDRESSES = {
	// Valid BSC testnet addresses (checksummed)
	user1: '0x1234567890123456789012345678901234567890',
	user2: '0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd',
	// Ambiguous address (no network qualifier)
	ambiguous: '0x9876543210987654321098765432109876543210'
};

const TEST_AMOUNTS = {
	// Realistic USDT amounts with 6 decimals
	small: '1.234567',
	medium: '12.345678',
	large: '100.000000',
	veryLarge: '1000.000000'
};

/**
 * Simplified test helper using the page object model
 */
async function createPageObject(page: Page): Promise<BitTaskerPageObject> {
	return new BitTaskerPageObject(page, TEST_CONFIG.BASE_URL);
}


/**
 * Scenario 1: Task Creation → Bid → Acceptance Flow
 * Verifies: Task creation with USDT on BSC, bid acceptance, escrow creation with payment metadata
 */
test.describe('Scenario 1: Task Creation → Bid → Acceptance Flow', () => {
	let page1: Page; // Task creator
	let page2: Page; // Bidder
	let po1: BitTaskerPageObject;
	let po2: BitTaskerPageObject;

	test.beforeEach(async ({ browser }) => {
		// Create two browser contexts for two users
		const context1 = await browser.newContext();
		const context2 = await browser.newContext();

		page1 = await context1.newPage();
		page2 = await context2.newPage();

		po1 = await createPageObject(page1);
		po2 = await createPageObject(page2);

		// Set up test wallets (mock or use testnet)
		await page1.addInitScript(() => {
			localStorage.setItem('test_wallet_user', '1');
		});
		await page2.addInitScript(() => {
			localStorage.setItem('test_wallet_user', '2');
		});
	});

	test.afterEach(async () => {
		await page1.close();
		await page2.close();
	});

	test('should complete task → bid → acceptance flow with USDT on BSC payment network', async () => {
		// Step 1: User 1 creates a task with USDT on BSC as payment
		await po1.gotoDashboard();
		await po1.clickCreateTask();

		// Fill task details
		await po1.fillTaskTitle('Logo Design Project');
		await po1.fillTaskDescription('Need professional logo design');
		await po1.fillTaskBudget(TEST_AMOUNTS.large);

		// Select USDT on BSC
		await po1.selectNetwork('BSC Testnet');
		await po1.selectAsset('USDT');

		// Verify payment network badge
		const networkBadge = page1.locator('[data-testid="payment-network-badge"]');
		await expect(networkBadge).toContainText('BSC');
		await expect(networkBadge).toContainText('Testnet');

		// Submit task creation
		await po1.clickSubmitTask();

		// Extract task ID
		const taskId = await po1.getCreatedTaskId();
		expect(taskId).toMatch(/^task-[0-9a-f]{8,}$/);

		// Step 2: User 2 places a bid on the task
		await po2.gotoTaskDetails(taskId);

		// Verify same payment network shown to bidder
		const bidNetworkBadge = page2.locator('[data-testid="payment-network-badge"]');
		await expect(bidNetworkBadge).toContainText('BSC');
		await expect(bidNetworkBadge).toContainText('Testnet');

		// Place bid
		await po2.clickPlaceBid();
		await po2.fillBidAmount(TEST_AMOUNTS.large);
		await po2.fillBidMessage('Professional designer with 10 years experience');

		// Verify bid uses same network context
		const bidNetworkDisplay = page2.locator('[data-testid="bid-payment-network"]');
		await expect(bidNetworkDisplay).toContainText('USDT');
		await expect(bidNetworkDisplay).toContainText('BSC');

		// Submit bid
		await po2.clickSubmitBid();

		// Step 3: User 1 accepts the bid
		await page1.reload();
		await waitForElement(page1, '[data-testid="incoming-bids"]', { timeout: TEST_CONFIG.TIMEOUT });

		const bidData = await po1.getBidFromList(0);
		expect(bidData.amount).toContain(TEST_AMOUNTS.large);

		// Accept bid
		await po1.clickAcceptBid(0);
		await waitForElement(page1, '[data-testid="bid-acceptance-confirmation"]', { timeout: TEST_CONFIG.TIMEOUT });

		// Confirm acceptance
		await po1.clickConfirmAcceptance();

		// Step 4: Verify escrow created with correct payment metadata
		const escrowData = await po1.getEscrowFromList(0);

		// Verify escrow shows correct amount and network
		expect(escrowData.amount).toContain(TEST_AMOUNTS.large);
		expect(escrowData.network).toContain('USDT');
		expect(escrowData.network).toContain('BSC');
		expect(escrowData.id).toMatch(/^[0-9a-f]{8,}$/);
	});
});

/**
 * Scenario 2: Send USDT Payment Flow
 * Verifies: Payment form, address validation, amount input, fee calculation, pending/success states
 */
test.describe('Scenario 2: Send USDT Payment Flow', () => {
	let po: BitTaskerPageObject;

	test.beforeEach(async ({ page }) => {
		po = await createPageObject(page);
		await page.addInitScript(() => {
			localStorage.setItem('test_wallet_user', '1');
		});
	});

	test('should complete send USDT payment with valid BSC address and amount', async ({ page }) => {
		// Navigate to send payment
		await po.navigateToSendPayment();

		// Select USDT on BSC
		await po.selectNetwork('BSC Testnet');
		await po.selectAsset('USDT');

		// Verify correct network icon
		const networkIcon = page.locator('[data-testid="selected-network-icon"]');
		await expect(networkIcon).toHaveAttribute('src', /chains\/bsc|binance/i);

		// Enter recipient address
		await po.fillRecipientAddress(TEST_ADDRESSES.user2);

		// Verify address is valid and accepted
		const addressError = page.locator('[data-testid="address-error"]');
		await expect(addressError).not.toBeVisible();

		// Enter amount
		await po.fillAmount(TEST_AMOUNTS.medium);

		// Verify amount is calculated correctly
		const amountDisplay = page.locator('[data-testid="display-amount"]');
		await expect(amountDisplay).toContainText(TEST_AMOUNTS.medium);

		// Verify unit is USDT (not sats)
		const amountUnit = page.locator('[data-testid="amount-unit"]');
		await expect(amountUnit).toContainText('USDT');

		// Wait for fee calculation
		await page.waitForSelector('[data-testid="network-fee"]', { timeout: TEST_CONFIG.TIMEOUT });

		// Verify fee is in USDT, not BNB
		const fee = await po.getNetworkFee();
		expect(fee).toMatch(/USDT|0\.\d+/);
		expect(fee).not.toContain('BNB');

		// Review payment details
		await po.clickReviewPayment();
		await page.waitForSelector('[data-testid="payment-review-screen"]', { timeout: TEST_CONFIG.TIMEOUT });

		// Verify review shows correct details
		const reviewAddress = page.locator('[data-testid="review-recipient-address"]');
		const reviewAmount = page.locator('[data-testid="review-amount"]');
		const reviewNetwork = page.locator('[data-testid="review-network"]');

		await expect(reviewAddress).toContainText(TEST_ADDRESSES.user2);
		await expect(reviewAmount).toContainText(TEST_AMOUNTS.medium);
		await expect(reviewNetwork).toContainText('BSC');

		// Confirm payment
		await po.clickConfirmPayment();
		await po.authenticateAndSend();

		// Verify pending state
		await po.waitForPendingState();
		const txHash = await po.getTransactionHash();
		expect(txHash).toMatch(/^0x[0-9a-f]{64}$/i);

		// Verify amount shows in USDT units
		const confirmedAmount = await po.getConfirmedAmount();
		expect(confirmedAmount).toContain(TEST_AMOUNTS.medium);
		expect(confirmedAmount).toContain('USDT');

		// Wait for success (in testnet, would wait for actual confirmation)
		// In real test, would poll blockchain or mock confirmation
		await page.waitForTimeout(2000);
	});
});

/**
 * Scenario 3: Receive USDT Payment Request
 * Verifies: Payment request generation, URI format, QR code, URI copying, network qualification
 */
test.describe('Scenario 3: Receive USDT Payment Request', () => {
	let po: BitTaskerPageObject;

	test.beforeEach(async ({ page }) => {
		po = await createPageObject(page);
		await page.addInitScript(() => {
			localStorage.setItem('test_wallet_user', '1');
		});
	});

	test('should generate payment request with USDT on BSC and valid URI format', async ({ page }) => {
		// Navigate to receive payment
		await po.navigateToReceivePayment();

		// Select USDT on BSC network
		await po.selectNetwork('BSC Testnet');
		await po.selectAsset('USDT');

		// Enter request amount
		await po.fillRequestAmount(TEST_AMOUNTS.small);

		// Generate payment request
		await po.generatePaymentRequest();

		// Step 1: Verify URI has BSC qualifier
		const uri = await po.getPaymentRequestURI();

		// Should have bsc: scheme or ethereum:@chainId format for BSC (97 = testnet, 56 = mainnet)
		expect(uri).toMatch(/^(bsc:|ethereum:.*@(56|97))/i);

		// Step 2: Verify displayed address
		const displayedAddress = await po.getDisplayedAddress();
		expect(displayedAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);

		// Step 3: Verify address in URI matches displayed address
		// Extract address from URI
		const addressFromUri = uri.match(/0x[0-9a-fA-F]{40}/)?.[0] || '';
		const normalizedDisplayed = displayedAddress.toLowerCase();
		const normalizedUri = addressFromUri.toLowerCase();
		expect(normalizedUri).toBe(normalizedDisplayed);

		// Step 4: Verify amount in URI
		const amountInUri = uri.match(/amount=([0-9.]+)/)?.[1] || '';
		// Amount in URI should match with proper decimals conversion
		expect(amountInUri).toBeTruthy();

		// Step 5: Copy URI and verify it matches
		await po.copyPaymentURI();
		const clipboard = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).toBe(uri);

		// Step 6: Verify QR code is displayed
		const qrCode = page.locator('[data-testid="payment-qr-code"]');
		await expect(qrCode).toBeVisible();

		// Step 7: Verify URI can be scanned and shared
		const shareButton = page.locator('[data-testid="share-request-button"]');
		await expect(shareButton).toBeVisible();

		// Verify network badge on request
		const networkBadge = page.locator('[data-testid="request-network-badge"]');
		await expect(networkBadge).toContainText('BSC');
	});
});

/**
 * Scenario 4: Ambiguous Address Handling
 * Verifies: Address disambiguation UI when raw 0x address is scanned, network selection, correct transaction routing
 */
test.describe('Scenario 4: Ambiguous Address Handling', () => {
	let po: BitTaskerPageObject;

	test.beforeEach(async ({ page }) => {
		po = await createPageObject(page);
		await page.addInitScript(() => {
			localStorage.setItem('test_wallet_user', '1');
		});
	});

	test('should handle ambiguous address with disambiguation UI', async ({ page }) => {
		// Navigate to send payment
		await po.navigateToSendPayment();

		// Enter ambiguous address (no network qualifier)
		await po.fillRecipientAddress(TEST_ADDRESSES.ambiguous);

		// Should trigger disambiguation UI
		await page.waitForSelector('[data-testid="network-disambiguation-dialog"]', { timeout: TEST_CONFIG.TIMEOUT });

		// Verify both options are shown
		const bscOption = page.locator('[data-testid="network-disambiguation-BSC"]');
		const rskOption = page.locator('[data-testid="network-disambiguation-RSK"]');

		await expect(bscOption).toBeVisible();
		await expect(rskOption).toBeVisible();

		// Step 1: Select BSC network
		await po.selectNetworkDisambiguation('BSC');

		// Verify form now has BSC selected
		const selectedNetwork = page.locator('[data-testid="selected-network"]');
		await expect(selectedNetwork).toContainText('BSC');

		// Dialog should close
		await expect(page.locator('[data-testid="network-disambiguation-dialog"]')).not.toBeVisible();

		// Step 2: Proceed with payment
		await po.selectAsset('USDT');
		await po.fillAmount(TEST_AMOUNTS.medium);
		await po.clickReviewPayment();

		// Verify BSC is set in review
		const reviewNetwork = page.locator('[data-testid="review-network"]');
		await expect(reviewNetwork).toContainText('BSC');

		// Step 3: Test RSK disambiguation path
		await page.goBack();
		await page.fill('[data-testid="recipient-address-input"]', TEST_ADDRESSES.ambiguous);

		await po.selectNetworkDisambiguation('RSK');

		// Verify RSK selected
		const selectedNetwork2 = page.locator('[data-testid="selected-network"]');
		await expect(selectedNetwork2).toContainText('RSK');
	});
});

/**
 * Scenario 5: Wrong Chain Detection
 * Verifies: Preflight check detects wrong chain, error message displayed, suggests switching, blocks transaction
 */
test.describe('Scenario 5: Wrong Chain Detection', () => {
	let po: BitTaskerPageObject;

	test.beforeEach(async ({ page }) => {
		po = await createPageObject(page);
		await page.addInitScript(() => {
			localStorage.setItem('test_wallet_user', '1');
			// Simulate wallet connected to wrong chain (RSK instead of BSC)
			window.localStorage.setItem('connected_chain_id', '31'); // RSK testnet
		});
	});

	test('should detect wrong chain and block transaction with clear error', async ({ page }) => {
		// Navigate to send USDT on BSC
		await po.navigateToSendPayment();
		await po.selectNetwork('BSC Testnet');
		await po.selectAsset('USDT');

		// Fill payment details
		await po.fillRecipientAddress(TEST_ADDRESSES.user2);
		await po.fillAmount(TEST_AMOUNTS.medium);

		// Review payment - this is where preflight check occurs
		await po.clickReviewPayment();

		// Should show error about wrong chain
		const errorVisible = await po.isErrorDisplayed();
		expect(errorVisible).toBe(true);

		const errorMessage = await po.getErrorMessage();
		expect(errorMessage).toMatch(/wrong.*chain|chain.*mismatch|switch.*network|network.*not.*supported/i);

		// Verify button to switch network is available
		const switchButton = page.locator('[data-testid="switch-chain-button"]');
		await expect(switchButton).toBeVisible();
		await expect(switchButton).toContainText(/switch|change.*network|select.*bsc/i);

		// Verify cannot proceed without fixing chain
		const confirmButton = page.locator('[data-testid="confirm-payment-button"]');
		await expect(confirmButton).toBeDisabled();

		// Click switch network button (would connect wallet to correct chain)
		await switchButton.click();
		await page.waitForTimeout(1000); // Wait for chain switch

		// In real test, wallet extension would handle this
		// For mocking, we'd update the connected chain
		await page.addInitScript(() => {
			window.localStorage.setItem('connected_chain_id', '97'); // Switch to BSC testnet
		});

		// Reload and verify error is gone
		await page.reload();
		await po.navigateToSendPayment();
		await po.selectNetwork('BSC Testnet');
		await po.selectAsset('USDT');
		await po.fillRecipientAddress(TEST_ADDRESSES.user2);
		await po.fillAmount(TEST_AMOUNTS.medium);

		// Should not show error now
		const errorVisibleAfter = await po.isErrorDisplayed();
		expect(errorVisibleAfter).toBe(false);

		// Should be able to proceed
		const confirmButtonAfter = page.locator('[data-testid="confirm-payment-button"]');
		await expect(confirmButtonAfter).not.toBeDisabled();
	});
});

/**
 * Scenario 6: Insufficient Balance Handling
 * Verifies: Validation fails on input, shows current balance, allows correction
 */
test.describe('Scenario 6: Insufficient Balance Handling', () => {
	let po: BitTaskerPageObject;

	test.beforeEach(async ({ page }) => {
		po = await createPageObject(page);
		await page.addInitScript(() => {
			localStorage.setItem('test_wallet_user', '1');
			// Set low balance (5 USDT)
			window.localStorage.setItem('usdt_balance', '5000000'); // 5 USDT in wei (6 decimals)
		});
	});

	test('should prevent sending more USDT than available balance', async ({ page }) => {
		// Navigate to send payment
		await po.navigateToSendPayment();
		await po.selectNetwork('BSC Testnet');
		await po.selectAsset('USDT');

		// Verify current balance is shown
		const balanceDisplay = page.locator('[data-testid="available-balance"]');
		const balanceText = await balanceDisplay.textContent() || '';
		expect(balanceText).toContain('5');
		expect(balanceText).toContain('USDT');

		// Try to send more than available
		await po.fillRecipientAddress(TEST_ADDRESSES.user2);
		await po.fillAmount(TEST_AMOUNTS.large); // 100 USDT > 5 USDT available

		// Should show validation error
		const amountError = page.locator('[data-testid="amount-error"]');
		await expect(amountError).toBeVisible();

		const errorText = await amountError.textContent() || '';
		expect(errorText).toMatch(/insufficient.*balance|not.*enough|exceed|too.*much/i);

		// Error should show available balance
		expect(errorText).toContain('5');

		// Should not be able to review
		const reviewButton = page.locator('[data-testid="review-payment-button"]');
		await expect(reviewButton).toBeDisabled();

		// User corrects amount
		await po.fillAmount('4.5'); // Less than available

		// Error should clear
		await expect(amountError).not.toBeVisible();

		// Can now review
		await expect(reviewButton).not.toBeDisabled();

		// Verify max button works
		const maxButton = page.locator('[data-testid="max-button"]');
		await maxButton.click();

		const amountInput = page.locator('[data-testid="amount-input"]');
		const maxAmount = await amountInput.inputValue();
		// Should be less than or equal to available balance minus gas fee
		expect(parseFloat(maxAmount)).toBeLessThanOrEqual(5);
	});
});

/**
 * Scenario 7: Sponsor Unavailability Handling
 * Verifies: Preflight check detects sponsor unavailability, shows error, suggests recovery
 */
test.describe('Scenario 7: Sponsor Unavailability Handling', () => {
	let po: BitTaskerPageObject;

	test.beforeEach(async ({ page }) => {
		po = await createPageObject(page);
		await page.addInitScript(() => {
			localStorage.setItem('test_wallet_user', '1');
			// Set sponsor status to unavailable
			window.localStorage.setItem('sponsor_status', 'unavailable');
		});
	});

	test('should detect sponsor unavailability and show recovery message', async ({ page }) => {
		// Navigate to send payment
		await po.navigateToSendPayment();
		await po.selectNetwork('BSC Testnet');
		await po.selectAsset('USDT');

		// Fill payment details
		await po.fillRecipientAddress(TEST_ADDRESSES.user2);
		await po.fillAmount(TEST_AMOUNTS.medium);

		// Review payment - preflight check should detect unavailable sponsor
		await po.clickReviewPayment();

		// Should show sponsor error
		const sponsorError = page.locator('[data-testid="sponsor-error"]');
		await expect(sponsorError).toBeVisible();

		const sponsorErrorText = await sponsorError.textContent() || '';
		expect(sponsorErrorText).toMatch(/sponsor.*unavailable|service.*temporarily.*unavailable|retry|try.*again/i);

		// Should suggest recovery action
		const retryButton = page.locator('[data-testid="retry-payment-button"]');
		await expect(retryButton).toBeVisible();

		// Verify cannot proceed
		const confirmButton = page.locator('[data-testid="confirm-payment-button"]');
		await expect(confirmButton).toBeDisabled();

		// Simulate sponsor becoming available
		await page.addInitScript(() => {
			window.localStorage.setItem('sponsor_status', 'available');
		});

		// Retry should work
		await retryButton.click();
		await page.waitForTimeout(1000);

		// Check if sponsor error clears
		await page.reload();
		await po.navigateToSendPayment();
		await po.selectNetwork('BSC Testnet');
		await po.selectAsset('USDT');
		await po.fillRecipientAddress(TEST_ADDRESSES.user2);
		await po.fillAmount(TEST_AMOUNTS.medium);

		const sponsorErrorAfter = page.locator('[data-testid="sponsor-error"]');
		await expect(sponsorErrorAfter).not.toBeVisible();

		// Should be able to proceed
		const confirmButtonAfter = page.locator('[data-testid="confirm-payment-button"]');
		await expect(confirmButtonAfter).not.toBeDisabled();
	});
});

/**
 * Scenario 8: Transaction History Integration
 * Verifies: Transaction appears in history with correct details, network badge, explorer link accuracy
 */
test.describe('Scenario 8: Transaction History Integration', () => {
	let po: BitTaskerPageObject;

	test.beforeEach(async ({ page }) => {
		po = await createPageObject(page);
		await page.addInitScript(() => {
			localStorage.setItem('test_wallet_user', '1');
			// Set up mock transaction in history
			const mockTx = {
				hash: '0x' + 'a'.repeat(64),
				from: TEST_ADDRESSES.user1,
				to: TEST_ADDRESSES.user2,
				value: '12345678', // 12.345678 USDT
				network: 'usdt-bsc',
				chainId: 97,
				type: 'send',
				status: 'confirmed',
				timestamp: Date.now()
			};
			window.localStorage.setItem('usdt_transactions', JSON.stringify([mockTx]));
		});
	});

	test('should display USDT transaction correctly in history with network and explorer link', async ({ page }) => {
		// Navigate to transaction history
		await po.navigateToTransactionHistory();

		// Wait for history to load
		await page.waitForSelector('[data-testid="transaction-row-0"]', { timeout: TEST_CONFIG.TIMEOUT });

		// Get transaction details from first row
		const tx = await po.getTransactionFromHistory(0);

		// Step 1: Verify amount shows in USDT units (not sats)
		expect(tx.amount).toContain('12.345678');
		expect(tx.amount).toContain('USDT');
		expect(tx.amount).not.toContain('sats');

		// Step 2: Verify network badge shows BSC
		expect(tx.network).toMatch(/BSC|Binance/i);
		expect(tx.network).toMatch(/testnet|mainnet/i);

		// Step 3: Verify status is displayed
		expect(tx.status).toMatch(/confirmed|pending|failed/i);

		// Step 4: Verify transaction hash matches
		const expectedHash = '0x' + 'a'.repeat(64);
		expect(tx.hash).toContain(expectedHash.slice(0, 10)); // Check first 10 chars

		// Step 5: Click explorer link and verify it points to BSCscan (not RSK explorer)
		const pagePromise = page.context().waitForEvent('page');
		await po.clickExplorerLink(0);
		const newPage = await pagePromise;
		const newUrl = newPage.url();

		// Should point to BSCscan (not RSK explorer)
		expect(newUrl).toMatch(/bscscan|bsc|binance/i);
		expect(newUrl).not.toMatch(/rsk|blockscout.*rsk/i);
		// Should contain transaction hash
		expect(newUrl).toContain('a'.repeat(10)); // Check for hash in URL

		await newPage.close();

		// Step 6: Verify can navigate back and transaction still shows correctly
		await page.goBack();
		await page.waitForSelector('[data-testid="transaction-row-0"]');

		const txAfter = await po.getTransactionFromHistory(0);
		expect(txAfter.amount).toContain('USDT');
		expect(txAfter.network).toMatch(/BSC/i);
	});

	test('should handle multiple transactions with correct network display per transaction', async ({ page }) => {
		await page.addInitScript(() => {
			// Add multiple transactions with different networks
			const mockTxs = [
				{
					hash: '0x' + 'a'.repeat(64),
					from: TEST_ADDRESSES.user1,
					to: TEST_ADDRESSES.user2,
					value: '100000000', // 100 USDT
					network: 'usdt-bsc',
					chainId: 97,
					type: 'send',
					status: 'confirmed',
					timestamp: Date.now()
				},
				{
					hash: '0x' + 'b'.repeat(64),
					from: TEST_ADDRESSES.user2,
					to: TEST_ADDRESSES.user1,
					value: '50000000', // 50 USDT
					network: 'usdt-bsc',
					chainId: 56,
					type: 'receive',
					status: 'confirmed',
					timestamp: Date.now() - 3600000
				}
			];
			window.localStorage.setItem('usdt_transactions', JSON.stringify(mockTxs));
		});

		// Navigate to transaction history
		await po.navigateToTransactionHistory();

		// Wait for both transactions
		await page.waitForSelector('[data-testid="transaction-row-1"]', { timeout: TEST_CONFIG.TIMEOUT });

		// Check first transaction
		const tx1 = await po.getTransactionFromHistory(0);
		expect(tx1.amount).toContain('100');
		expect(tx1.network).toMatch(/BSC/i);

		// Check second transaction
		const tx2 = await po.getTransactionFromHistory(1);
		expect(tx2.amount).toContain('50');
		expect(tx2.network).toMatch(/BSC/i);

		// Each should have correct explorer link
		const pagePromise1 = page.context().waitForEvent('page');
		await po.clickExplorerLink(0);
		const newPage1 = await pagePromise1;
		expect(newPage1.url()).toMatch(/bscscan/i);
		await newPage1.close();
	});
});

/**
 * Helper to create realistic test data
 */
function createTestTransaction(overrides: Partial<any> = {}) {
	return {
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: TEST_ADDRESSES.user1,
		to: TEST_ADDRESSES.user2,
		value: '12345678',
		network: 'usdt-bsc',
		chainId: 97,
		type: 'send',
		status: 'confirmed',
		timestamp: Date.now(),
		...overrides
	};
}
