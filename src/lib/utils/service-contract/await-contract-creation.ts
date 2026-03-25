import { escrow } from '$lib/utils/escrow';
import type { ContractCreationEvent, ContractCreationState } from '$lib/types/contract';
import { get } from 'svelte/store';

export const DEFAULT_CONTRACT_CREATION_TIMEOUT_MS = 45_000;
export const CONTRACT_CREATION_SYNCING_MESSAGE =
	'The secure payment contract transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.';
export type ContractCreationTimeoutReason = 'pending_timeout' | 'tx_replaced';

function normalizeTransactionHash(transactionHash: string): string {
	return transactionHash.trim().toLowerCase();
}

function matchesTransactionHash(
	event: ContractCreationEvent | null,
	transactionHash: string
): event is ContractCreationEvent {
	if (!event) {
		return false;
	}

	const expectedHash = normalizeTransactionHash(transactionHash);
	if (!expectedHash) {
		return false;
	}

	const candidateHashes = [event.transactionHash, ...(event.transactionHashes ?? [])]
		.map((value) => (typeof value === 'string' ? normalizeTransactionHash(value) : null))
		.filter((value): value is string => Boolean(value));

	return candidateHashes.includes(expectedHash);
}

function isTerminalContractCreationState(
	state: ContractCreationState | undefined
): state is Extract<ContractCreationState, 'contract_ready' | 'contract_sync_pending' | 'failed'> {
	return state === 'contract_ready' || state === 'contract_sync_pending' || state === 'failed';
}

function hasReplacementTransaction(
	event: ContractCreationEvent | null,
	transactionHash: string
): boolean {
	if (!matchesTransactionHash(event, transactionHash)) {
		return false;
	}

	const expectedHash = normalizeTransactionHash(transactionHash);
	return (event.transactionHashes ?? [])
		.map((value) => (typeof value === 'string' ? normalizeTransactionHash(value) : null))
		.some((value) => Boolean(value) && value !== expectedHash);
}

export function getContractCreationTimeoutReason(
	transactionHash: string,
	event: ContractCreationEvent | null = get(escrow.eventOps.getContractCreationStore())
): ContractCreationTimeoutReason {
	return hasReplacementTransaction(event, transactionHash) ? 'tx_replaced' : 'pending_timeout';
}

export async function waitForContractCreationByTransactionHash(
	transactionHash: string,
	timeoutMs: number = DEFAULT_CONTRACT_CREATION_TIMEOUT_MS
): Promise<ContractCreationEvent> {
	if (!transactionHash.trim()) {
		throw new Error('Transaction hash is required to await contract creation.');
	}

	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error('Timeout must be a positive number of milliseconds.');
	}

	const contractCreationStore = escrow.eventOps.getContractCreationStore();
	const currentEvent = get(contractCreationStore);

	if (matchesTransactionHash(currentEvent, transactionHash)) {
		if (currentEvent.error) {
			throw new Error(currentEvent.error);
		}

		if (currentEvent.state === 'contract_sync_pending') {
			throw new Error(CONTRACT_CREATION_SYNCING_MESSAGE);
		}

		if (currentEvent.escrowId) {
			return currentEvent;
		}
	}

	return await new Promise<ContractCreationEvent>((resolve, reject) => {
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

		const handleEvent = (event: ContractCreationEvent | null) => {
			if (!matchesTransactionHash(event, transactionHash)) {
				return;
			}

			if (event.error) {
				finalize(() => reject(new Error(event.error)));
				return;
			}

			if (event.state === 'contract_sync_pending') {
				finalize(() => reject(new Error(CONTRACT_CREATION_SYNCING_MESSAGE)));
				return;
			}

			if (isTerminalContractCreationState(event.state) && !event.escrowId) {
				finalize(() =>
					reject(
						new Error(
							event.error ||
								(event.state === 'failed'
									? 'Contract creation failed.'
									: CONTRACT_CREATION_SYNCING_MESSAGE)
						)
					)
				);
				return;
			}

			if (!event.escrowId) {
				return;
			}

			finalize(() => resolve(event));
		};

		const timeoutId = setTimeout(() => {
			finalize(() => reject(new Error(CONTRACT_CREATION_SYNCING_MESSAGE)));
		}, timeoutMs);

		unsubscribe = contractCreationStore.subscribe((event) => {
			handleEvent(event);
		});
	});
}
