/**
 * Shared lifecycle helpers for v1 and v2 payment contracts: rune ids, Kind 31006 publish, push, parallel side-effects.
 * Preflight (fresh chain + permissions) stays version-specific — see `v1Preflight.ts` / `v2Preflight.ts`.
 */

import { nip19 } from 'nostr-tools';
import type { NDKUser } from '@nostr-dev-kit/ndk';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import { ndk } from '$lib/nostr/ndk';
import { createDebug } from '$lib/utils/debug';
import { runParallelNamed } from '$lib/utils/contract/parallelEffects';
import type { Attachment } from '$lib/types/task';
import { ContractStatus } from '$lib/utils/contract/types';
import type { PaymentContractRuneLike } from './types';
import { getClientOrigin } from '$lib/utils/helpers/clientOrigin';

const d = createDebug('contract:lifecycle:writeHelpers');

const CONTRACTS_TAB_URL = () => `${getClientOrigin()}/hiring/contracts`;

const PUSH_ICON = 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg';

/** Trimmed ids every on-chain write needs; `parentId` = Kind 30006 event id. */
export type RuneWriteIds = {
	paymentId: string;
	contractAddress: string;
	parentId: string;
};

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

export async function notifyContractCounterparty(params: {
	recipientPubkey: string;
	title: string;
	body: string;
	type: string;
}): Promise<void> {
	await pushNotificationService.sendNotificationToNpubs({
		npubs: [nip19.npubEncode(params.recipientPubkey)],
		title: params.title,
		body: params.body,
		type: params.type,
		clickAction: CONTRACTS_TAB_URL(),
		icon: PUSH_ICON
	});
}

export async function runWriteSideEffects(
	logLabel: string,
	tasks: ReadonlyArray<{ name: string; run: () => Promise<unknown> }>
): Promise<void> {
	const { failures } = await runParallelNamed([...tasks]);
	if (failures.length > 0) {
		d.warn(`${logLabel}: side effects had failures`, failures);
	}
}

/**
 * Post-chain pipeline: Kind 31006, optional extra parallel jobs (e.g. kind 31000), then push.
 * Used by both v1 and v2 lifecycle orchestrators.
 */
export async function broadcastThenParallelEffects(
	logLabel: string,
	ids: RuneWriteIds,
	signer: NonNullable<typeof ndk.activeUser>,
	transactionHash: string,
	recipientPubkey: string,
	chainStatus: ContractStatus,
	writeMethod: string,
	push: { title: string; body: string; type: string },
	extraBetweenStatusAndPush?: ReadonlyArray<{ name: string; run: () => Promise<unknown> }>,
	completionAttachments?: Attachment[],
	completionText?: string,
	proposedAmounts?: { proposedTaskeeAmount?: string; proposedTaskerAmount?: string }
): Promise<void> {
	const tasks: { name: string; run: () => Promise<unknown> }[] = [
		{
			name: 'nostrContractStatus',
			run: () =>
				publishContractStatus({
					signer,
					ids,
					recipientPubkey,
					transactionHash,
					chainStatus,
					writeMethod,
					completionAttachments,
					completionText,
					proposedTaskeeAmount: proposedAmounts?.proposedTaskeeAmount,
					proposedTaskerAmount: proposedAmounts?.proposedTaskerAmount
				})
		}
	];
	if (extraBetweenStatusAndPush?.length) {
		tasks.push(...extraBetweenStatusAndPush);
	}
	tasks.push({
		name: 'push',
		run: () =>
			notifyContractCounterparty({
				recipientPubkey,
				title: push.title,
				body: push.body,
				type: push.type
			})
	});
	await runWriteSideEffects(logLabel, tasks);
}
