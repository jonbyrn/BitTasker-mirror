/**
 * Playwright Page Object Model for BitTasker E2E Tests
 *
 * Encapsulates all page interactions to reduce duplication
 * and improve maintainability
 */

import { Page, expect } from '@playwright/test';
import {
	waitForElement,
	waitForElementHidden,
	clickWithRetry,
	fillInputWithRetry,
	waitForNetworkIdle,
	WAIT_CONFIG
} from './wait-utils';

export class BitTaskerPageObject {
	constructor(
		protected page: Page,
		protected baseUrl: string = 'http://localhost:5173'
	) {}

	// =====================
	// Navigation Methods
	// =====================

	async goto(path: string): Promise<void> {
		await this.page.goto(`${this.baseUrl}${path}`);
		await waitForNetworkIdle(this.page, WAIT_CONFIG.longWait);
	}

	async gotoSendPayment(): Promise<void> {
		await this.goto('/dashboard/send-payment');
		await waitForElement(this.page, '[data-testid="send-payment-form"]', { timeout: WAIT_CONFIG.maxTimeout });
	}

	async gotoReceivePayment(): Promise<void> {
		await this.goto('/dashboard/receive-payment');
		await waitForElement(this.page, '[data-testid="receive-payment-form"]', { timeout: WAIT_CONFIG.maxTimeout });
	}

	async gotoDashboard(): Promise<void> {
		await this.goto('/dashboard');
		await waitForNetworkIdle(this.page, WAIT_CONFIG.longWait);
	}

	async gotoTaskDetails(taskId: string): Promise<void> {
		await this.goto(`/dashboard/task/${taskId}`);
		await waitForElement(this.page, '[data-testid="task-details"]', { timeout: WAIT_CONFIG.maxTimeout });
	}

	// =====================
	// Form Interaction Methods
	// =====================

	async fillRecipientAddress(address: string): Promise<void> {
		await fillInputWithRetry(this.page, '[data-testid="recipient-address-input"]', address, {
			timeout: WAIT_CONFIG.maxTimeout
		});

		// Wait for validation
		await this.page.waitForTimeout(WAIT_CONFIG.shortWait);
	}

	async fillAmount(amount: string): Promise<void> {
		await fillInputWithRetry(this.page, '[data-testid="amount-input"]', amount, {
			timeout: WAIT_CONFIG.maxTimeout
		});

		// Wait for calculation
		await this.page.waitForTimeout(WAIT_CONFIG.shortWait);
	}

	async fillTaskTitle(title: string): Promise<void> {
		await fillInputWithRetry(this.page, '[data-testid="task-title"]', title, {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async fillTaskDescription(description: string): Promise<void> {
		await fillInputWithRetry(this.page, '[data-testid="task-description"]', description, {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async fillTaskBudget(budget: string): Promise<void> {
		await fillInputWithRetry(this.page, '[data-testid="task-budget"]', budget, {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async fillBidAmount(amount: string): Promise<void> {
		await fillInputWithRetry(this.page, '[data-testid="bid-amount-input"]', amount, {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async fillBidMessage(message: string): Promise<void> {
		await fillInputWithRetry(this.page, '[data-testid="bid-message"]', message, {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async fillRequestAmount(amount: string): Promise<void> {
		await fillInputWithRetry(this.page, '[data-testid="request-amount-input"]', amount, {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	// =====================
	// Network Selection Methods
	// =====================

	async selectNetwork(networkName: string): Promise<void> {
		const networkId = networkName.toLowerCase().replace(/\s+/g, '-');
		await clickWithRetry(this.page, `[data-testid="network-selector-${networkId}"]`, {
			timeout: WAIT_CONFIG.maxTimeout
		});

		await waitForNetworkIdle(this.page, WAIT_CONFIG.mediumWait);
	}

	async selectAsset(assetSymbol: string): Promise<void> {
		await clickWithRetry(this.page, `[data-testid="asset-selector-${assetSymbol}"]`, {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async disambiguateNetwork(network: 'BSC' | 'RSK'): Promise<void> {
		await clickWithRetry(this.page, `[data-testid="network-disambiguation-${network}"]`, {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	// =====================
	// Button Click Methods
	// =====================

	async clickReviewPayment(): Promise<void> {
		await clickWithRetry(this.page, '[data-testid="review-payment-button"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async clickConfirmPayment(): Promise<void> {
		await clickWithRetry(this.page, '[data-testid="confirm-payment-button"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async clickGenerateRequest(): Promise<void> {
		await clickWithRetry(this.page, '[data-testid="generate-request-button"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});

		// Wait for QR code to generate
		await waitForElement(this.page, '[data-testid="payment-qr-code"]', { timeout: WAIT_CONFIG.maxTimeout });
	}

	async clickCopyUri(): Promise<void> {
		await clickWithRetry(this.page, '[data-testid="copy-uri-button"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async clickCreateTask(): Promise<void> {
		await clickWithRetry(this.page, '[data-testid="create-task-button"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});

		await waitForElement(this.page, '[data-testid="create-task-form"]', { timeout: WAIT_CONFIG.maxTimeout });
	}

	async clickSubmitTask(): Promise<void> {
		await clickWithRetry(this.page, '[data-testid="submit-task-button"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});

		await waitForElement(this.page, '[data-testid="task-created-success"]', { timeout: WAIT_CONFIG.maxTimeout });
	}

	async clickPlaceBid(): Promise<void> {
		await clickWithRetry(this.page, '[data-testid="place-bid-button"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});

		await waitForElement(this.page, '[data-testid="bid-amount-input"]', { timeout: WAIT_CONFIG.maxTimeout });
	}

	async clickSubmitBid(): Promise<void> {
		await clickWithRetry(this.page, '[data-testid="submit-bid-button"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});

		await waitForElement(this.page, '[data-testid="bid-submitted-success"]', { timeout: WAIT_CONFIG.maxTimeout });
	}

	async clickAcceptBid(bidIndex: number = 0): Promise<void> {
		const bidRow = this.page.locator(`[data-testid="bid-row-${bidIndex}"]`);
		const acceptButton = bidRow.locator('[data-testid="accept-bid-button"]');

		await clickWithRetry(
			this.page,
			`[data-testid="bid-row-${bidIndex}"] [data-testid="accept-bid-button"]`,
			{ timeout: WAIT_CONFIG.maxTimeout }
		);
	}

	async clickConfirmAcceptance(): Promise<void> {
		await clickWithRetry(this.page, '[data-testid="confirm-acceptance-button"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});

		await waitForElement(this.page, '[data-testid="contract-created-success"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async clickExplorerLink(txIndex: number): Promise<void> {
		await clickWithRetry(this.page, `[data-testid="explorer-link-${txIndex}"]`, {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async clickRetryPayment(): Promise<void> {
		await clickWithRetry(this.page, '[data-testid="retry-payment-button"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async clickMaxButton(): Promise<void> {
		await clickWithRetry(this.page, '[data-testid="max-button"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	// =====================
	// Data Retrieval Methods
	// =====================

	async getPaymentRequestUri(): Promise<string> {
		const element = this.page.locator('[data-testid="payment-request-uri"]');
		await element.waitFor({ state: 'attached', timeout: WAIT_CONFIG.maxTimeout });
		return (await element.inputValue()) || '';
	}

	async getDisplayedAddress(): Promise<string> {
		const element = this.page.locator('[data-testid="display-address"]');
		return (await element.textContent()) || '';
	}

	async getDisplayedAmount(): Promise<string> {
		const element = this.page.locator('[data-testid="display-amount"]');
		return (await element.textContent()) || '';
	}

	async getNetworkFee(): Promise<string> {
		const element = this.page.locator('[data-testid="network-fee"]');
		return (await element.textContent()) || '';
	}

	async getConfirmedAmount(): Promise<string> {
		const element = this.page.locator('[data-testid="confirmed-amount"]');
		return (await element.textContent()) || '';
	}

	async getTransactionHash(): Promise<string> {
		const element = this.page.locator('[data-testid="transaction-hash"]');
		return (await element.textContent()) || '';
	}

	async getErrorMessage(): Promise<string> {
		const element = this.page.locator('[data-testid="error-message"]');
		return (await element.textContent()) || '';
	}

	async getCreatedTaskId(): Promise<string> {
		const element = this.page.locator('[data-testid="created-task-id"]');
		return (await element.textContent()) || '';
	}

	async getTaskTitle(): Promise<string> {
		const element = this.page.locator('[data-testid="task-title-display"]');
		return (await element.textContent()) || '';
	}

	async getAvailableBalance(): Promise<string> {
		const element = this.page.locator('[data-testid="available-balance"]');
		return (await element.textContent()) || '';
	}

	// =====================
	// Visibility Check Methods
	// =====================

	async isErrorDisplayed(): Promise<boolean> {
		return this.page.locator('[data-testid="error-message"]').isVisible();
	}

	async isSponsorErrorDisplayed(): Promise<boolean> {
		return this.page.locator('[data-testid="sponsor-error"]').isVisible();
	}

	async isSuccessScreenVisible(): Promise<boolean> {
		return this.page.locator('[data-testid="transaction-success-screen"]').isVisible();
	}

	async isPendingScreenVisible(): Promise<boolean> {
		return this.page.locator('[data-testid="pending-transaction-screen"]').isVisible();
	}

	async isElementVisible(selector: string): Promise<boolean> {
		return this.page.locator(selector).isVisible();
	}

	// =====================
	// Wait Methods
	// =====================

	async waitForPendingState(): Promise<void> {
		await waitForElement(this.page, '[data-testid="pending-transaction-screen"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async waitForSuccessState(): Promise<void> {
		await waitForElement(this.page, '[data-testid="transaction-success-screen"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async waitForErrorState(): Promise<void> {
		await waitForElement(this.page, '[data-testid="error-message"]', {
			timeout: WAIT_CONFIG.maxTimeout,
			visible: true
		});
	}

	async waitForDisambiguationDialog(): Promise<void> {
		await waitForElement(this.page, '[data-testid="network-disambiguation-dialog"]', {
			timeout: WAIT_CONFIG.maxTimeout
		});
	}

	async waitForTask(taskId: string): Promise<void> {
		await this.page.goto(`${this.baseUrl}/dashboard/task/${taskId}`);
		await waitForElement(this.page, '[data-testid="task-details"]', { timeout: WAIT_CONFIG.maxTimeout });
	}

	// =====================
	// Transaction History Methods
	// =====================

	async getTransactionFromHistory(index: number): Promise<{
		amount: string;
		network: string;
		status: string;
		hash: string;
	}> {
		const row = this.page.locator(`[data-testid="transaction-row-${index}"]`);
		await row.waitFor({ state: 'visible', timeout: WAIT_CONFIG.maxTimeout });

		return {
			amount: (await row.locator('[data-testid="tx-amount"]').textContent()) || '',
			network: (await row.locator('[data-testid="tx-network"]').textContent()) || '',
			status: (await row.locator('[data-testid="tx-status"]').textContent()) || '',
			hash: (await row.locator('[data-testid="tx-hash"]').textContent()) || ''
		};
	}

	async getBidFromList(bidIndex: number): Promise<{
		amount: string;
		message: string;
		network: string;
	}> {
		const row = this.page.locator(`[data-testid="bid-row-${bidIndex}"]`);
		await row.waitFor({ state: 'visible', timeout: WAIT_CONFIG.maxTimeout });

		return {
			amount: (await row.locator('[data-testid="bid-amount"]').textContent()) || '',
			message: (await row.locator('[data-testid="bid-message"]').textContent()) || '',
			network: (await row.locator('[data-testid="bid-network"]').textContent()) || ''
		};
	}

	async getEscrowFromList(index: number): Promise<{
		amount: string;
		network: string;
		status: string;
		id: string;
	}> {
		const card = this.page.locator(`[data-testid="escrow-card-${index}"]`);
		await card.waitFor({ state: 'visible', timeout: WAIT_CONFIG.maxTimeout });

		return {
			amount: (await card.locator('[data-testid="escrow-amount"]').textContent()) || '',
			network: (await card.locator('[data-testid="escrow-network"]').textContent()) || '',
			status: (await card.locator('[data-testid="escrow-status"]').textContent()) || '',
			id: (await card.locator('[data-testid="escrow-id"]').textContent()) || ''
		};
	}
}
