/**
 * V2 Escrow events — no pending Nostr (publish CONTRACT only after tx hash).
 * Stubs for register/cleanup/store; publishEscrowStatus to be wired in Milestone B.
 */

import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { ContractCreationEvent, PublishContractStatusParams } from '$lib/types/contract';
import { createDebug } from '$lib/utils/debug';

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

/** Stub until Milestone B: publish CONTRACT_STATUS after completeTask/acceptTask. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature matches interface
export async function publishEscrowStatus(_params: PublishContractStatusParams): Promise<void> {
	throw new Error('V2 publishEscrowStatus not implemented yet');
}
