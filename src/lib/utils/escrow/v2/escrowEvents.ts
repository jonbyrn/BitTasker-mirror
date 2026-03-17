/**
 * V2 Escrow events — no pending Nostr (publish CONTRACT only after tx hash).
 * publishEscrowStatus publishes CONTRACT_STATUS via v2 nostrContract.
 */

import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { ContractCreationEvent, PublishContractStatusParams } from '$lib/types/contract';
import { createDebug } from '$lib/utils/debug';
import { publishContractStatus } from './nostrContract';

const d = createDebug('escrow:v2:events');

/** V2 does not register pending by tx hash; we publish CONTRACT only after we have paymentId. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature matches interface
export function registerPendingContractByTxHash(_params: unknown): void {
	d.log('registerPendingContractByTxHash no-op (V2)');
}

/** No-op. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature matches interface
export function cleanupPendingContractByTxHash(_transactionHash: string): void {
	d.log('cleanupPendingContractByTxHash no-op (V2)');
}

export const contractCreationStore: Writable<ContractCreationEvent | null> = writable(null);

/** Publish CONTRACT_STATUS (v2) after completeTask/acceptTask; no pending store. */
export async function publishEscrowStatus(params: PublishContractStatusParams): Promise<void> {
	await publishContractStatus({
		contractEventId: params.contractEventId,
		escrowId: params.escrowId,
		action: params.status,
		transactionHash: params.transactionHash,
		completionAttachments: params.completionAttachments,
		proposedClientAmount: params.proposedClientAmount,
		proposedFreelancerAmount: params.proposedFreelancerAmount
	});
	d.log('publishEscrowStatus', { escrowId: params.escrowId, status: params.status });
}
