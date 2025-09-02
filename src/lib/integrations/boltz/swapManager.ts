/**
 * Boltz Swap Manager
 * Manages the lifecycle of submarine swaps with monitoring and recovery
 */

import { writable, type Writable } from 'svelte/store';
import { boltzClient } from './client';
import type { 
	SwapMonitor, 
	SwapEvent, 
	SwapEventCallback,
	SwapStatusType,
	CreateSwapResponse,
	CreateReverseSwapResponse
} from './types';
import { breezSecurity } from '$lib/wallet/breez/security';

export class SwapManager {
	private activeSwaps: Map<string, SwapMonitor> = new Map();
	private swapStore: Writable<SwapMonitor[]> = writable([]);
	private eventCallbacks: Map<string, SwapEventCallback[]> = new Map();
	private monitoringIntervals: Map<string, number> = new Map();

	constructor() {
		this.loadPersistedSwaps();
	}

	/**
	 * Create and monitor a submarine swap (Lightning → Bitcoin)
	 */
	async createSubmarineSwap(params: {
		invoice: string;
		refundPublicKey: string;
		bitcoinAddress: string;
		amount: number;
	}): Promise<string> {
		// Verify passkey for swap creation
		const isAuthorized = await breezSecurity.verifyPasskeyForSend(
			params.amount,
			params.bitcoinAddress,
			'BTC'
		);

		if (!isAuthorized) {
			throw new Error('Swap not authorized - passkey verification failed');
		}

		try {
			// Create swap with Boltz
			const swapResponse = await boltzClient.createSubmarineSwap({
				pairId: 'L-BTC/BTC',
				invoice: params.invoice,
				refundPublicKey: params.refundPublicKey
			});

			// Create swap monitor
			const swapMonitor: SwapMonitor = {
				swapId: swapResponse.id,
				type: 'submarine',
				status: 'swap.created',
				createdAt: new Date(),
				updatedAt: new Date(),
				pairId: 'L-BTC/BTC',
				amount: params.amount,
				onchainAddress: params.bitcoinAddress,
				timeoutBlockHeight: swapResponse.timeoutBlockHeight
			};

			this.addSwap(swapMonitor);
			this.startMonitoring(swapResponse.id);

			return swapResponse.id;
		} catch (error) {
			console.error('Failed to create submarine swap:', error);
			throw error;
		}
	}

	/**
	 * Create and monitor a reverse submarine swap (Bitcoin → Lightning)
	 */
	async createReverseSubmarineSwap(params: {
		invoiceAmount: number;
		preimageHash: string;
		claimPublicKey: string;
		lightningInvoice?: string;
	}): Promise<string> {
		// Verify passkey for swap creation
		const isAuthorized = await breezSecurity.verifyPasskeyForSend(
			params.invoiceAmount,
			'lightning',
			'L-BTC'
		);

		if (!isAuthorized) {
			throw new Error('Reverse swap not authorized - passkey verification failed');
		}

		try {
			// Create reverse swap with Boltz
			const swapResponse = await boltzClient.createReverseSubmarineSwap({
				pairId: 'L-BTC/BTC',
				invoiceAmount: params.invoiceAmount,
				preimageHash: params.preimageHash,
				claimPublicKey: params.claimPublicKey
			});

			// Create swap monitor
			const swapMonitor: SwapMonitor = {
				swapId: swapResponse.id,
				type: 'reversesubmarine',
				status: 'swap.created',
				createdAt: new Date(),
				updatedAt: new Date(),
				pairId: 'L-BTC/BTC',
				amount: params.invoiceAmount,
				invoice: swapResponse.invoice,
				preimageHash: params.preimageHash,
				timeoutBlockHeight: swapResponse.timeoutBlockHeight
			};

			this.addSwap(swapMonitor);
			this.startMonitoring(swapResponse.id);

			return swapResponse.id;
		} catch (error) {
			console.error('Failed to create reverse submarine swap:', error);
			throw error;
		}
	}

	/**
	 * Get swap by ID
	 */
	getSwap(swapId: string): SwapMonitor | undefined {
		return this.activeSwaps.get(swapId);
	}

	/**
	 * Get all active swaps
	 */
	getAllSwaps(): SwapMonitor[] {
		return Array.from(this.activeSwaps.values());
	}

	/**
	 * Get swaps store for reactive UI
	 */
	getSwapsStore(): Writable<SwapMonitor[]> {
		return this.swapStore;
	}

	/**
	 * Add event listener for swap events
	 */
	addEventListener(swapId: string, callback: SwapEventCallback): () => void {
		if (!this.eventCallbacks.has(swapId)) {
			this.eventCallbacks.set(swapId, []);
		}
		this.eventCallbacks.get(swapId)!.push(callback);

		// Return cleanup function
		return () => {
			const callbacks = this.eventCallbacks.get(swapId);
			if (callbacks) {
				const index = callbacks.indexOf(callback);
				if (index > -1) {
					callbacks.splice(index, 1);
				}
			}
		};
	}

	/**
	 * Refund a failed swap
	 */
	async refundSwap(
		swapId: string,
		bitcoinAddress: string,
		feePerVbyte?: number
	): Promise<string> {
		const swap = this.activeSwaps.get(swapId);
		if (!swap) {
			throw new Error('Swap not found');
		}

		// Verify passkey for refund operation
		const isAuthorized = await breezSecurity.verifyPasskeyForOffPlatform(
			bitcoinAddress,
			swap.amount
		);

		if (!isAuthorized) {
			throw new Error('Refund not authorized - passkey verification failed');
		}

		try {
			const refundResponse = await boltzClient.refundSwap(swapId, {
				address: bitcoinAddress,
				feePerVbyte
			});

			// Update swap status
			this.updateSwapStatus(swapId, 'transaction.refunded');

			return refundResponse.transactionId;
		} catch (error) {
			console.error(`Failed to refund swap ${swapId}:`, error);
			throw error;
		}
	}

	/**
	 * Claim a reverse swap
	 */
	async claimSwap(
		swapId: string,
		preimage: string,
		bitcoinAddress: string,
		feePerVbyte?: number
	): Promise<string> {
		const swap = this.activeSwaps.get(swapId);
		if (!swap) {
			throw new Error('Swap not found');
		}

		try {
			const claimResponse = await boltzClient.claimSwap(swapId, {
				preimage,
				address: bitcoinAddress,
				feePerVbyte
			});

			// Update swap status
			this.updateSwapStatus(swapId, 'transaction.confirmed');

			return claimResponse.transactionId;
		} catch (error) {
			console.error(`Failed to claim swap ${swapId}:`, error);
			throw error;
		}
	}

	/**
	 * Cancel swap monitoring
	 */
	stopMonitoring(swapId: string): void {
		const intervalId = this.monitoringIntervals.get(swapId);
		if (intervalId) {
			clearInterval(intervalId);
			this.monitoringIntervals.delete(swapId);
		}
	}

	/**
	 * Remove swap from active tracking
	 */
	removeSwap(swapId: string): void {
		this.stopMonitoring(swapId);
		this.activeSwaps.delete(swapId);
		this.eventCallbacks.delete(swapId);
		this.updateStore();
		this.persistSwaps();
	}

	/**
	 * Clean up expired swaps
	 */
	cleanupExpiredSwaps(): void {
		const now = new Date();
		const expiredSwaps: string[] = [];

		for (const [swapId, swap] of this.activeSwaps.entries()) {
			// Remove swaps older than 24 hours that are in final state
			const age = now.getTime() - swap.updatedAt.getTime();
			const isOld = age > 24 * 60 * 60 * 1000; // 24 hours
			const isFinal = this.isFinalStatus(swap.status);

			if (isOld && isFinal) {
				expiredSwaps.push(swapId);
			}
		}

		expiredSwaps.forEach(swapId => this.removeSwap(swapId));
	}

	/**
	 * Add swap to tracking
	 */
	private addSwap(swap: SwapMonitor): void {
		this.activeSwaps.set(swap.swapId, swap);
		this.updateStore();
		this.persistSwaps();
	}

	/**
	 * Start monitoring swap status
	 */
	private startMonitoring(swapId: string): void {
		// Poll every 10 seconds
		const intervalId = setInterval(async () => {
			try {
				const status = await boltzClient.getSwapStatus(swapId);
				this.updateSwapStatus(swapId, status.status, status.failureReason);

				// Stop monitoring if swap is in final state
				if (this.isFinalStatus(status.status)) {
					this.stopMonitoring(swapId);
				}
			} catch (error) {
				console.error(`Error monitoring swap ${swapId}:`, error);
			}
		}, 10000);

		this.monitoringIntervals.set(swapId, intervalId as any);
	}

	/**
	 * Update swap status and emit events
	 */
	private updateSwapStatus(
		swapId: string, 
		status: SwapStatusType, 
		failureReason?: string
	): void {
		const swap = this.activeSwaps.get(swapId);
		if (!swap) return;

		const oldStatus = swap.status;
		swap.status = status;
		swap.updatedAt = new Date();
		if (failureReason) {
			swap.failureReason = failureReason;
		}

		// Emit event if status changed
		if (oldStatus !== status) {
			this.emitSwapEvent(swapId, {
				swapId,
				status,
				timestamp: new Date(),
				failureReason
			});
		}

		this.updateStore();
		this.persistSwaps();
	}

	/**
	 * Emit swap event to listeners
	 */
	private emitSwapEvent(swapId: string, event: SwapEvent): void {
		const callbacks = this.eventCallbacks.get(swapId);
		if (callbacks) {
			callbacks.forEach(callback => {
				try {
					callback(event);
				} catch (error) {
					console.error('Error in swap event callback:', error);
				}
			});
		}
	}

	/**
	 * Check if status is final
	 */
	private isFinalStatus(status: SwapStatusType): boolean {
		const finalStatuses: SwapStatusType[] = [
			'transaction.confirmed',
			'transaction.refunded',
			'swap.refunded',
			'swap.expired'
		];
		return finalStatuses.includes(status);
	}

	/**
	 * Update reactive store
	 */
	private updateStore(): void {
		this.swapStore.set(Array.from(this.activeSwaps.values()));
	}

	/**
	 * Persist swaps to localStorage
	 */
	private persistSwaps(): void {
		try {
			const swapsData = JSON.stringify(
				Array.from(this.activeSwaps.values()),
				(key, value) => {
					// Convert dates to ISO strings
					if (value instanceof Date) {
						return value.toISOString();
					}
					return value;
				}
			);
			localStorage.setItem('boltz_swaps', swapsData);
		} catch (error) {
			console.error('Failed to persist swaps:', error);
		}
	}

	/**
	 * Load persisted swaps from localStorage
	 */
	private loadPersistedSwaps(): void {
		try {
			const swapsData = localStorage.getItem('boltz_swaps');
			if (swapsData) {
				const swaps: SwapMonitor[] = JSON.parse(swapsData, (key, value) => {
					// Convert ISO strings back to dates
					if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
						return new Date(value);
					}
					return value;
				});

				swaps.forEach(swap => {
					this.activeSwaps.set(swap.swapId, swap);
					
					// Resume monitoring for non-final swaps
					if (!this.isFinalStatus(swap.status)) {
						this.startMonitoring(swap.swapId);
					}
				});

				this.updateStore();
			}
		} catch (error) {
			console.error('Failed to load persisted swaps:', error);
		}
	}
}

// Export singleton instance
export const swapManager = new SwapManager();

// Auto-cleanup expired swaps every hour
setInterval(() => {
	swapManager.cleanupExpiredSwaps();
}, 60 * 60 * 1000);