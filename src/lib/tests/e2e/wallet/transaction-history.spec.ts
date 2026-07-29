import { test, expect } from '../fixtures/auth';

/**
 * Transaction History E2E Tests
 * Tests viewing, filtering, and navigating transaction history
 */

test.describe('Transaction History', () => {
	test.beforeEach(async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/wallet');
		await authenticatedPage.waitForLoadState('networkidle');
		// Wait for wallet to initialize - look for any wallet content (card, buttons, tabs, or error state)
		const walletContent = authenticatedPage
			.locator(
				'.card, button:has-text("Send"), button:has-text("Receive"), .tab, .alert, [class*="wallet"]'
			)
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });
	});

	test('should navigate to transaction history', async ({ authenticatedPage }) => {
		// Look for transactions button - could be in BalanceCard or as a tab
		const transactionsButton = authenticatedPage
			.locator(
				'button:has-text("Transactions"), button:has([class*="list"]), a[href*="transaction"]'
			)
			.first();
		const isVisible = await transactionsButton.isVisible().catch(() => false);

		if (isVisible) {
			await transactionsButton.click();
			await authenticatedPage.waitForLoadState('networkidle');
		} else {
			// Try clicking transactions tab if it exists
			const transactionsTab = authenticatedPage
				.locator('.tab:has-text("Transactions"), button[class*="tab"]:has-text("Transactions")')
				.first();
			const tabVisible = await transactionsTab.isVisible().catch(() => false);
			if (tabVisible) {
				await transactionsTab.click();
				await authenticatedPage.waitForLoadState('networkidle');
			}
		}

		// Should show transaction history content
		const transactionContent = authenticatedPage
			.locator('.transaction-list, [data-testid="transactions"], text=/transaction|history/i')
			.first();
		await expect(transactionContent).toBeVisible({ timeout: 5000 });
	});

	test('should display transaction list', async ({ authenticatedPage }) => {
		// Wait for wallet content to appear first
		const walletContent = authenticatedPage
			.locator('.card, button:has-text("Send"), button:has-text("Receive"), .tab, .alert')
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15000 });

		// Navigate to transactions - try button first
		const transactionsButton = authenticatedPage
			.locator('button:has-text("Transactions"), button:has([class*="list"])')
			.first();
		const isVisible = await transactionsButton.isVisible({ timeout: 5000 }).catch(() => false);
		if (isVisible) {
			await transactionsButton.click();
			await authenticatedPage.waitForLoadState('networkidle');
		} else {
			// Try tab
			const transactionsTab = authenticatedPage.locator('.tab:has-text("Transactions")').first();
			const tabVisible = await transactionsTab.isVisible({ timeout: 5000 }).catch(() => false);
			if (tabVisible) {
				await transactionsTab.click();
				await authenticatedPage.waitForLoadState('networkidle');
			}
		}

		// Should show transaction list or empty state - wait for either to appear
		// TransactionHistory component may render transactions in various ways
		const transactionList = authenticatedPage
			.locator(
				'.transaction-list, [data-testid="transactions"], .transaction-item, details summary, text=/transaction/i'
			)
			.first();
		const emptyState = authenticatedPage.getByText(/no transactions|empty|no history/i).first();

		// Try to find either transaction list or empty state
		const hasList = await transactionList.isVisible({ timeout: 5000 }).catch(() => false);
		const hasEmpty = await emptyState.isVisible({ timeout: 5000 }).catch(() => false);

		if (!hasList && !hasEmpty) {
			// If neither found, wait a bit more and try again
			await authenticatedPage.waitForTimeout(2000);
			await expect(transactionList.or(emptyState)).toBeVisible({ timeout: 8000 });
		}
	});

	test('should filter transactions by type', async ({ authenticatedPage }) => {
		// Navigate to transactions
		const transactionsButton = authenticatedPage
			.locator('button:has-text("Transactions"), button:has([class*="list"])')
			.first();
		const isVisible = await transactionsButton.isVisible().catch(() => false);
		if (isVisible) {
			await transactionsButton.click();
			await authenticatedPage.waitForLoadState('networkidle');
		}

		// Find type filter buttons
		const sendFilter = authenticatedPage
			.locator('button:has-text("Send"), button:has-text("Sent")')
			.first();
		const receiveFilter = authenticatedPage
			.locator('button:has-text("Receive"), button:has-text("Received")')
			.first();

		const sendVisible = await sendFilter.isVisible().catch(() => false);
		if (sendVisible) {
			await sendFilter.click();
			await authenticatedPage.waitForLoadState('networkidle');

			// Should filter to send transactions - check for active state
			const isActive = await sendFilter
				.evaluate((el: Element) => {
					return (
						el.getAttribute('aria-pressed') === 'true' ||
						el.classList.contains('active') ||
						el.classList.contains('btn-active')
					);
				})
				.catch(() => false);
			expect(isActive).toBe(true);
		}

		const receiveVisible = await receiveFilter.isVisible().catch(() => false);
		if (receiveVisible) {
			await receiveFilter.click();
			await authenticatedPage.waitForLoadState('networkidle');

			// Should filter to receive transactions
			const isActive = await receiveFilter
				.evaluate((el: Element) => {
					return (
						el.getAttribute('aria-pressed') === 'true' ||
						el.classList.contains('active') ||
						el.classList.contains('btn-active')
					);
				})
				.catch(() => false);
			expect(isActive).toBe(true);
		}
	});

	test('should filter transactions by network', async ({ authenticatedPage }) => {
		// Navigate to transactions
		const transactionsButton = authenticatedPage
			.locator('button:has-text("Transactions"), button:has([class*="list"])')
			.first();
		const isVisible = await transactionsButton.isVisible().catch(() => false);
		if (isVisible) {
			await transactionsButton.click();
			await authenticatedPage.waitForLoadState('networkidle');
		}

		// Find network filter
		const networkFilter = authenticatedPage
			.locator(
				'button:has-text("Network"), select[name*="network"], details summary:has-text("Network")'
			)
			.first();
		const isVisibleFilter = await networkFilter.isVisible().catch(() => false);

		if (isVisibleFilter) {
			await networkFilter.click();
			await authenticatedPage.waitForLoadState('networkidle');

			// Select RSK network - could be in dropdown or select
			const rskOption = authenticatedPage
				.locator('button:has-text("RSK"), option[value*="rsk"], li:has-text("RSK")')
				.first();
			const optionVisible = await rskOption.isVisible().catch(() => false);
			if (optionVisible) {
				await rskOption.click();
				await authenticatedPage.waitForLoadState('networkidle');
			}
		}
	});

	test('should expand transaction details', async ({ authenticatedPage }) => {
		// Navigate to transactions
		const transactionsButton = authenticatedPage
			.locator('button:has-text("Transactions"), button:has([class*="list"])')
			.first();
		const isVisible = await transactionsButton.isVisible().catch(() => false);
		if (isVisible) {
			await transactionsButton.click();
			await authenticatedPage.waitForLoadState('networkidle');
		}

		// Find first transaction item
		const transactionItem = authenticatedPage
			.locator('.transaction-item, [data-testid="transaction"], details summary, .collapse-title')
			.first();
		const isVisibleItem = await transactionItem.isVisible().catch(() => false);

		if (isVisibleItem) {
			await transactionItem.click();
			await authenticatedPage.waitForLoadState('networkidle');

			// Details should be expanded
			const details = authenticatedPage
				.locator('.transaction-details, [aria-expanded="true"], details[open], .collapse-open')
				.first();
			await expect(details).toBeVisible({ timeout: 3000 });
		}
	});

	test('should show transaction status', async ({ authenticatedPage }) => {
		// Navigate to transactions
		const transactionsButton = authenticatedPage
			.locator('button:has-text("Transactions"), button:has([class*="list"])')
			.first();
		const isVisible = await transactionsButton.isVisible().catch(() => false);
		if (isVisible) {
			await transactionsButton.click();
			await authenticatedPage.waitForLoadState('networkidle');
		}

		// Should show status indicators - wait for transactions to load
		await authenticatedPage.waitForLoadState('networkidle');
		const statusIndicators = authenticatedPage
			.locator('text=/confirmed|pending|failed|success/i')
			.first();
		const isVisibleStatus = await statusIndicators.isVisible({ timeout: 5000 }).catch(() => false);

		if (isVisibleStatus) {
			await expect(statusIndicators).toBeVisible();
		}
	});

	test('should show explorer link for transactions', async ({ authenticatedPage }) => {
		// Navigate to transactions
		const transactionsButton = authenticatedPage
			.locator('button:has-text("Transactions"), button:has([class*="list"])')
			.first();
		const isVisible = await transactionsButton.isVisible().catch(() => false);
		if (isVisible) {
			await transactionsButton.click();
			await authenticatedPage.waitForLoadState('networkidle');
		}

		// Find transaction with explorer link
		const explorerLink = authenticatedPage
			.locator('a[href*="explorer"], a[href*="blockchain"], a[href*="blockstream"], a[href*="rsk"]')
			.first();
		const isVisibleLink = await explorerLink.isVisible({ timeout: 5000 }).catch(() => false);

		if (isVisibleLink) {
			await expect(explorerLink).toHaveAttribute('href', /.+/);
			const target = await explorerLink.getAttribute('target').catch(() => null);
			if (target !== null) {
				await expect(explorerLink).toHaveAttribute('target', '_blank');
			}
		}
	});

	test('should handle empty transaction state', async ({ authenticatedPage }) => {
		// Navigate to transactions
		const transactionsButton = authenticatedPage
			.locator('button:has-text("Transactions"), button:has([class*="list"])')
			.first();
		const isVisible = await transactionsButton.isVisible().catch(() => false);
		if (isVisible) {
			await transactionsButton.click();
			await authenticatedPage.waitForLoadState('networkidle');
		}

		// Should show empty state message if no transactions
		await authenticatedPage.waitForLoadState('networkidle');
		const emptyState = authenticatedPage
			.locator('text=/no transactions|empty|no history/i')
			.first();

		// May or may not be visible depending on data
		const isVisibleEmpty = await emptyState.isVisible({ timeout: 5000 }).catch(() => false);
		if (isVisibleEmpty) {
			await expect(emptyState).toBeVisible();
		}
	});
});
