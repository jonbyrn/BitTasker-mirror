/**
 * v2 Pending Contracts Registration
 *
 * Manages pending service contracts during the transaction confirmation window.
 * This is the v2 equivalent of the pending contract tracking in escrow/v1/escrowEvents.ts.
 *
 * Key differences from v1:
 * - Lighter weight: Only tracks what's needed for transaction confirmation
 * - Service-focused: Optimized for service contract flows
 * - Event-driven: Works with the v2 contract event system
 */

import { writable } from 'svelte/store';
import type { ServiceAcceptanceSnapshot } from '$lib/types/service-quote';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('contract:v2:pending');

export interface PendingServiceContractV2 {
	transactionHash: string;
	serviceId: string;
	serviceAddress: string;
	serviceTitle: string;
	freelancerPubkey: string;
	purchaseMode: 'quote' | 'instant_buy';
	proposalId?: string;
	proposalEventId?: string;
	quoteRequestId?: string;
	instantOrderId?: string;
	acceptanceSnapshot?: ServiceAcceptanceSnapshot;
	registeredAt: number;
}

export type ServiceContractCreationState =
	| { state: 'funding_submitted'; transactionHash: string }
	| { state: 'confirmed'; transactionHash: string; paymentId: string }
	| { state: 'failed'; transactionHash: string; error: string }
	| null;

export const serviceContractCreationStore = writable<ServiceContractCreationState>(null);

const pendingServiceContractsByTxHash = new Map<string, PendingServiceContractV2>();

function normalizeTransactionHash(transactionHash: string | null | undefined): string | null {
	if (typeof transactionHash !== 'string') {
		return null;
	}
	const normalizedValue = transactionHash.trim().toLowerCase();
	return normalizedValue.length > 0 ? normalizedValue : null;
}

/**
 * Register a pending service contract creation by transaction hash.
 * Called immediately after the transaction is broadcast but before confirmation.
 */
export function registerPendingServiceContractV2(
	params: Omit<PendingServiceContractV2, 'registeredAt'>
): void {
	const normalizedTxHash = normalizeTransactionHash(params.transactionHash);
	if (!normalizedTxHash) {
		d.warn('registerPendingServiceContractV2: invalid transaction hash');
		return;
	}

	const pending: PendingServiceContractV2 = {
		...params,
		transactionHash: normalizedTxHash,
		registeredAt: Date.now()
	};

	pendingServiceContractsByTxHash.set(normalizedTxHash, pending);
	serviceContractCreationStore.set({
		state: 'funding_submitted',
		transactionHash: normalizedTxHash
	});

	d.log('registerPendingServiceContractV2', {
		txHash: normalizedTxHash.slice(0, 10),
		serviceId: params.serviceId
	});
}

/**
 * Get a pending service contract by transaction hash.
 */
export function getPendingServiceContractByTxHash(
	transactionHash: string
): PendingServiceContractV2 | undefined {
	const normalizedTxHash = normalizeTransactionHash(transactionHash);
	if (!normalizedTxHash) {
		return undefined;
	}
	return pendingServiceContractsByTxHash.get(normalizedTxHash);
}

/**
 * Remove a pending service contract after confirmation or failure.
 */
export function cleanupPendingServiceContractV2(transactionHash: string): void {
	const normalizedTxHash = normalizeTransactionHash(transactionHash);
	if (!normalizedTxHash) {
		return;
	}

	const removed = pendingServiceContractsByTxHash.delete(normalizedTxHash);
	if (removed) {
		d.log('cleanupPendingServiceContractV2', {
			transactionHash: normalizedTxHash.slice(0, 10)
		});
	}
}

/**
 * Mark a service contract as confirmed with its payment ID.
 */
export function confirmServiceContractV2(transactionHash: string, paymentId: string): void {
	const normalizedTxHash = normalizeTransactionHash(transactionHash);
	if (!normalizedTxHash) {
		return;
	}

	serviceContractCreationStore.set({
		state: 'confirmed',
		transactionHash: normalizedTxHash,
		paymentId
	});

	cleanupPendingServiceContractV2(normalizedTxHash);
	d.log('confirmServiceContractV2', {
		transactionHash: normalizedTxHash.slice(0, 10),
		paymentId
	});
}

/**
 * Mark a service contract creation as failed.
 */
export function failServiceContractV2(transactionHash: string, error: string): void {
	const normalizedTxHash = normalizeTransactionHash(transactionHash);
	if (!normalizedTxHash) {
		return;
	}

	serviceContractCreationStore.set({
		state: 'failed',
		transactionHash: normalizedTxHash,
		error
	});

	cleanupPendingServiceContractV2(normalizedTxHash);
	d.log('failServiceContractV2', {
		transactionHash: normalizedTxHash.slice(0, 10),
		error
	});
}

/**
 * Get all pending service contracts (for debugging/monitoring).
 */
export function getAllPendingServiceContracts(): PendingServiceContractV2[] {
	return Array.from(pendingServiceContractsByTxHash.values());
}

/**
 * Clear all pending contracts (for testing/cleanup).
 */
export function clearAllPendingServiceContracts(): void {
	pendingServiceContractsByTxHash.clear();
	serviceContractCreationStore.set(null);
}
