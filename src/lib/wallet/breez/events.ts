import type { SdkEvent, EventListener, Payment } from '@breeztech/breez-sdk-liquid/web';
import { writable } from 'svelte/store';
import { getSdk } from './sdk';

// Event stores
export const paymentEventsStore = writable<SdkEvent[]>([]);
export const pendingPaymentsStore = writable<Payment[]>([]);

// Event listener state
let mainEventListenerId: string | null = null;
let pendingPaymentPollingInterval: NodeJS.Timeout | null = null;

/**
 * Payment event listener for production monitoring
 */
class PaymentEventListener implements EventListener {
	onEvent = (event: SdkEvent) => {		
		// Update event store for UI consumption (keep last 50 events)
		paymentEventsStore.update(events => [...events.slice(-49), event]);
		
		// Handle specific payment events
		this.handlePaymentEvent(event);
	}

	private handlePaymentEvent(event: SdkEvent) {
		switch (event.type) {
			case 'paymentPending':
				console.log('Payment pending - updating UI status');
				break;
			case 'paymentWaitingConfirmation':
				console.log('Payment waiting for confirmation');
				break;
			case 'paymentSucceeded':
				console.log('Payment succeeded');
				this.refreshPendingPayments();
				break;
			case 'paymentFailed':
				console.log('Payment failed - enabling retry');
				this.refreshPendingPayments();
				break;
			case 'paymentRefundPending':
				console.log('Refund pending');
				break;
			case 'paymentRefunded':
				console.log('Payment refunded');
				this.refreshPendingPayments();
				break;
		}
	}

	private async refreshPendingPayments() {
		try {
			const payments = await listPendingPayments();
			pendingPaymentsStore.set(payments);
		} catch (error) {
			console.error('Failed to refresh pending payments:', error);
		}
	}
}

/**
 * List pending payments that may need user action
 */
async function listPendingPayments(): Promise<Payment[]> {
	try {
		const sdk = getSdk();
		return await sdk.listPayments({
			states: ['pending', 'waitingFeeAcceptance']
		});
	} catch (error) {
		console.error('Failed to list pending payments:', error);
		return [];
	}
}

/**
 * Handle amountless Bitcoin payments that need fee acceptance
 */
async function handleAmountlessBitcoinPayments(): Promise<void> {
	try {
		const sdk = getSdk();
		const payments = await sdk.listPayments({
			states: ['waitingFeeAcceptance']
		});

		for (const payment of payments) {
			if (payment.details?.type !== 'bitcoin') continue;

			console.log('📋 Processing amountless Bitcoin payment:', payment.timestamp || 'unknown');

			// Fetch proposed fees
			const feeResponse = await sdk.fetchPaymentProposedFees({
				swapId: payment.details.swapId
			});

			console.log(`💰 Proposed fees: ${feeResponse.feesSat} sats for ${feeResponse.payerAmountSat} sats`);

			// Auto-accept fees under reasonable threshold (e.g., 2%)
			const feePercentage = (feeResponse.feesSat / feeResponse.payerAmountSat) * 100;

			if (feePercentage <= 2.0) {
				console.log('✅ Auto-accepting reasonable fee');
				await sdk.acceptPaymentProposedFees({ response: feeResponse });
			} else {
				console.log('⚠️ High fee detected, requires manual approval');
				// Store for manual review - in production, show UI notification
			}
		}
	} catch (error) {
		console.error('Failed to handle amountless Bitcoin payments:', error);
	}
}

/**
 * Start monitoring pending payments
 */
function startPendingPaymentMonitoring(): void {
	// Poll every 30 seconds for pending payment updates
	pendingPaymentPollingInterval = setInterval(async () => {
		try {
			const pendingPayments = await listPendingPayments();
			pendingPaymentsStore.set(pendingPayments);
			
			// Handle amountless Bitcoin payments automatically
			await handleAmountlessBitcoinPayments();
		} catch (error) {
			console.error('Pending payment monitoring error:', error);
		}
	}, 30000); // 30 seconds
}

/**
 * Stop monitoring pending payments
 */
function stopPendingPaymentMonitoring(): void {
	if (pendingPaymentPollingInterval) {
		clearInterval(pendingPaymentPollingInterval);
		pendingPaymentPollingInterval = null;
		console.log('⏹️ Pending payment monitoring stopped');
	}
}

/**
 * Initialize event system
 */
export async function initializeEventSystem(): Promise<void> {
	try {
		const sdk = getSdk();
		
		// Add main event listener
		const eventListener = new PaymentEventListener();
		mainEventListenerId = await sdk.addEventListener(eventListener);
		
		console.log('📡 Payment event listener registered');
		
		// Start pending payment monitoring
		startPendingPaymentMonitoring();
		console.log('⏱️ Pending payment monitoring started');
		
	} catch (error) {
		console.error('Failed to initialize event system:', error);
		throw error;
	}
}

/**
 * Cleanup event system
 */
export async function cleanupEventSystem(): Promise<void> {
	try {
		// Stop monitoring
		stopPendingPaymentMonitoring();
		
		// Remove main event listener
		if (mainEventListenerId) {
			const sdk = getSdk();
			await sdk.removeEventListener(mainEventListenerId);
			mainEventListenerId = null;
		}
		
		console.log('🧹 Event system cleaned up');
	} catch (error) {
		console.error('Failed to cleanup event system:', error);
	}
}

/**
 * Add custom event listener
 */
export async function addEventListener(
	callback: (event: SdkEvent) => void
): Promise<string> {
	try {
		const sdk = getSdk();
		const listener: EventListener = { onEvent: callback };
		return await sdk.addEventListener(listener);
	} catch (error) {
		console.error('Failed to add event listener:', error);
		throw error;
	}
}

/**
 * Remove custom event listener
 */
export async function removeEventListener(listenerId: string): Promise<void> {
	try {
		const sdk = getSdk();
		await sdk.removeEventListener(listenerId);
	} catch (error) {
		console.error(`Failed to remove event listener ${listenerId}:`, error);
	}
}