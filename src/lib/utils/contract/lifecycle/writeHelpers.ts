/**
 * Shared lifecycle helpers for v1 and v2 payment contracts: rune ids, Kind 31006 publish, parallel side-effects.
 * Preflight (fresh chain + permissions) stays version-specific — see `v1Preflight.ts` / `v2Preflight.ts`.
 *
 * Push notifications for contract lifecycle events are handled by the backend's Nostr indexer.
 * Enrichment data for scheduled reminders is fired from here (non-blocking, fire-and-forget).
 */

import type { NDKUser } from '@nostr-dev-kit/ndk';
import { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import { ndk } from '$lib/nostr/ndk';
import { createDebug } from '$lib/utils/debug';
import { runParallelNamed } from '$lib/utils/contract/parallelEffects';
import type { Attachment } from '$lib/types/task';
import { ContractStatus } from '$lib/utils/contract/types';
import type { PaymentContractRuneLike } from './types';
import { notificationCenterService } from '$lib/api/services/notificationCenter.service';
import type { EnrichmentRequest } from '$lib/types/notification';

const d = createDebug('contract:lifecycle:writeHelpers');

/** Trimmed ids every on-chain write needs; `parentId` = Kind 30006 event id. */
export type RuneWriteIds = {
	paymentId: string;
	contractAddress: string;
	parentId: string;
};

export interface BroadcastParams {
	logLabel: string;
	ids: RuneWriteIds;
	signer: NonNullable<typeof ndk.activeUser>;
	transactionHash: string;
	recipientPubkey: string;
	chainStatus: ContractStatus;
	writeMethod: string;
	extraTasks?: ReadonlyArray<{ name: string; run: () => Promise<unknown> }>;
	completionAttachments?: Attachment[];
	completionText?: string;
	proposedAmounts?: { proposedTaskeeAmount?: string; proposedTaskerAmount?: string };
	enrichment?: EnrichmentRequest;
}

export function getRuneWriteIds(rune: PaymentContractRuneLike): RuneWriteIds | null {
	const paymentId = rune.paymentId?.trim();
	const contractAddress = rune.contractAddress?.trim() || rune.contract.contractAddress?.trim();
	const parentId = rune.parentEventId;
	if (!paymentId || !contractAddress || !parentId) return null;
	return { paymentId, contractAddress, parentId };
}

/**
 * Publish Kind 31006 contract status. **`NDKContractStatus.version` is `"v2"`** on the wire for both
 * legacy Escrow (v1 chain) and SecurePayment (v2 chain) — see integration docs.
 */
export async function publishContractStatus(params: {
	signer: NDKUser;
	ids: RuneWriteIds;
	recipientPubkey: string;
	transactionHash: string;
	chainStatus: ContractStatus;
	writeMethod: string;
	completionAttachments?: Attachment[];
	completionText?: string;
	proposedTaskeeAmount?: string;
	proposedTaskerAmount?: string;
}): Promise<void> {
	const status = new NDKContractStatus(ndk);
	status.author = params.signer;
	status.paymentId = params.ids.paymentId;
	status.parentContractEventId = params.ids.parentId;
	status.recipientPubkey = params.recipientPubkey;
	status.version = 'v2';
	status.messageType = 'contract-status';
	status.status = params.chainStatus;
	status.transactionHash = params.transactionHash;
	status.tags.push(['writeMethod', params.writeMethod]);
	if (params.completionAttachments !== undefined && params.completionAttachments.length > 0) {
		status.completionAttachments = params.completionAttachments;
	}
	if (params.completionText !== undefined && params.completionText !== '') {
		status.completionText = params.completionText;
	}
	if (params.proposedTaskeeAmount !== undefined) {
		status.proposedTaskeeAmount = params.proposedTaskeeAmount;
	}
	if (params.proposedTaskerAmount !== undefined) {
		status.proposedTaskerAmount = params.proposedTaskerAmount;
	}
	await status.publish();
}

export async function runWriteSideEffects(
	logLabel: string,
	tasks: ReadonlyArray<{ name: string; run: () => Promise<unknown> }>
): Promise<{ failures: { name: string; error: unknown }[] }> {
	const { failures } = await runParallelNamed([...tasks]);
	if (failures.length > 0) {
		d.warn(`${logLabel}: side effects had failures`, failures);
	}
	return { failures };
}

/**
 * Post-chain pipeline: Kind 31006 publish, optional extra parallel jobs (e.g. kind 31000),
 * then fire enrichment for scheduled reminders (non-blocking).
 *
 * Used by both v1 and v2 lifecycle orchestrators.
 */
export async function broadcastThenParallelEffects(params: BroadcastParams): Promise<void> {
	const tasks: { name: string; run: () => Promise<unknown> }[] = [
		{
			name: 'nostrContractStatus',
			run: () =>
				publishContractStatus({
					signer: params.signer,
					ids: params.ids,
					recipientPubkey: params.recipientPubkey,
					transactionHash: params.transactionHash,
					chainStatus: params.chainStatus,
					writeMethod: params.writeMethod,
					completionAttachments: params.completionAttachments,
					completionText: params.completionText,
					proposedTaskeeAmount: params.proposedAmounts?.proposedTaskeeAmount,
					proposedTaskerAmount: params.proposedAmounts?.proposedTaskerAmount
				})
		}
	];
	if (params.extraTasks?.length) {
		tasks.push(...params.extraTasks);
	}
	const { failures } = await runWriteSideEffects(params.logLabel, tasks);
	if (
		params.writeMethod === 'completeTask' &&
		failures.some((f) => f.name === 'nostrContractStatus')
	) {
		console.log('[complete-task] publish Nostr event failed', {
			paymentId: params.ids.paymentId,
			transactionHash: params.transactionHash
		});
	}

	if (params.enrichment) {
		notificationCenterService.enrich(params.enrichment).catch((err) => {
			d.warn(`${params.logLabel}: enrichment failed (non-blocking)`, err);
		});
	}
}
