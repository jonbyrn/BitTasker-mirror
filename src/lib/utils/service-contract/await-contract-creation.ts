/**
 * Await Contract Creation
 *
 * This module waits for service contract creation by subscribing to the v2 pending contracts store.
 * It has been updated to use the contract/v2 system instead of the legacy escrow/ system.
 *
 * For reactive UI patterns, prefer using:
 * - PaymentContractRune.start() handles contract resolution automatically
 * - The rune's isPending state + resolvePaymentIdFromTxHash() provide the same capability
 *
 * See docs/service-escrow-version-abstraction.md for migration details.
 */

import {
	serviceContractCreationStore,
	type ServiceContractCreationState,
	getPendingServiceContractByTxHash
} from '$lib/utils/contract/v2/pending-contracts';
import { get } from 'svelte/store';

export const DEFAULT_CONTRACT_CREATION_TIMEOUT_MS = 45_000;
export const CONTRACT_CREATION_SYNCING_MESSAGE =
	'The secure payment contract transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.';
export type ContractCreationTimeoutReason = 'pending_timeout' | 'tx_replaced';

/**
 * Represents a successful contract creation result with payment ID
 */
export interface ServiceContractCreationResult {
	transactionHash: string;
	paymentId: string;
	state: NonNullable<ServiceContractCreationState>['state'];
}

function normalizeTransactionHash(transactionHash: string): string {
	return transactionHash.trim().toLowerCase();
}

function matchesTransactionHash(
	state: ServiceContractCreationState,
	transactionHash: string
): boolean {
	if (!state) {
		return false;
	}

	const expectedHash = normalizeTransactionHash(transactionHash);
	if (!expectedHash) {
		return false;
	}

	return normalizeTransactionHash(state.transactionHash) === expectedHash;
}

export function getContractCreationTimeoutReason(
	transactionHash: string,
	state: ServiceContractCreationState = get(serviceContractCreationStore)
): ContractCreationTimeoutReason {
	const pending = getPendingServiceContractByTxHash(transactionHash);
	if (!pending && !state) {
		return 'pending_timeout';
	}
	return 'pending_timeout';
}

export async function waitForContractCreationByTransactionHash(
	transactionHash: string,
	timeoutMs: number = DEFAULT_CONTRACT_CREATION_TIMEOUT_MS
): Promise<ServiceContractCreationResult> {
	if (!transactionHash.trim()) {
		throw new Error('Transaction hash is required to await contract creation.');
	}

	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error('Timeout must be a positive number of milliseconds.');
	}

	const currentState = get(serviceContractCreationStore);

	if (matchesTransactionHash(currentState, transactionHash)) {
		if (currentState!.state === 'failed') {
			throw new Error('error' in currentState! ? currentState!.error : 'Contract creation failed.');
		}

		if (currentState!.state === 'confirmed' && 'paymentId' in currentState!) {
			return {
				transactionHash: currentState!.transactionHash,
				paymentId: currentState!.paymentId,
				state: currentState!.state
			};
		}
	}

	return await new Promise<ServiceContractCreationResult>((resolve, reject) => {
		let settled = false;
		let unsubscribe = () => {};

		const finalize = (callback: () => void) => {
			if (settled) {
				return;
			}

			settled = true;
			clearTimeout(timeoutId);
			unsubscribe();
			callback();
		};

		const handleState = (state: ServiceContractCreationState) => {
			if (!matchesTransactionHash(state, transactionHash)) {
				return;
			}

			if (state!.state === 'failed') {
				const errorMsg = 'error' in state! ? state!.error : 'Contract creation failed.';
				finalize(() => reject(new Error(errorMsg)));
				return;
			}

			if (state!.state === 'confirmed' && 'paymentId' in state!) {
				finalize(() =>
					resolve({
						transactionHash: state!.transactionHash,
						paymentId: state!.paymentId,
						state: state!.state
					})
				);
				return;
			}
		};

		const timeoutId = setTimeout(() => {
			finalize(() => reject(new Error(CONTRACT_CREATION_SYNCING_MESSAGE)));
		}, timeoutMs);

		unsubscribe = serviceContractCreationStore.subscribe((state) => {
			handleState(state);
		});
	});
}
