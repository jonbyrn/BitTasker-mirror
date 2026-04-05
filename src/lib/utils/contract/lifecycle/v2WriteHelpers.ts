/**
 * Shared pieces for v2 escrow orchestrators: preflight, 31006 publish, push, parallel side-effects.
 * Keeps `v2.ts` per-action functions thin so cancel / dispute / … follow the same pattern.
 */

import { nip19 } from 'nostr-tools';
import type { NDKUser } from '@nostr-dev-kit/ndk';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import { ndk } from '$lib/nostr/ndk';
import { createDebug } from '$lib/utils/debug';
import { runParallelNamed } from '$lib/utils/contract/parallelEffects';
import { loadPaymentContractDetailsV2 } from '$lib/utils/contract/v2/loadPaymentContractDetailsV2';
import { buildDisputeProjectionForPayment } from '$lib/utils/contract/v2/disputeProjectionFromStatus';
import {
	computePermittedActions,
	type PermittedActions
} from '$lib/utils/contract/v2/permittedActions';
import type { Attachment } from '$lib/types/task';
import { ContractStatus } from '$lib/utils/contract/types';
import type { ContractLifecycleResult } from './types';
import type { PaymentContractRuneLike } from './types';
import { permissionsNowSeconds } from './time';

const d = createDebug('contract:lifecycle:v2:writeHelpers');

const CONTRACTS_TAB_URL = () => `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`;

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
 * Fresh chain read + `computePermittedActions` (awaitingTx: false).
 * @returns `undefined` if OK; otherwise early-return **`ContractLifecycleResult`** for the caller.
 */
export async function runV2Preflight(
	rune: PaymentContractRuneLike,
	ids: RuneWriteIds,
	opts: {
		isAllowed: (p: PermittedActions) => boolean;
		logLabel: string;
	}
): Promise<ContractLifecycleResult | undefined> {
	try {
		const payment = await loadPaymentContractDetailsV2(ids.paymentId, ids.contractAddress, 'rsk');
		const disputeProjection = buildDisputeProjectionForPayment(
			{
				taskerPubkey: rune.taskerPubkey,
				taskeePubkey: rune.contract.taskeePubkey,
				statusEventsByNewest: rune.statusEventsByNewest
			},
			payment.state
		);
		const perms = computePermittedActions({
			payment,
			isTasker: rune.isTasker,
			now: permissionsNowSeconds(),
			awaitingTx: false,
			disputeProjection
		});
		if (!opts.isAllowed(perms)) {
			d.warn(`${opts.logLabel}: preflight denied (fresh chain + permissions)`);
			return { ok: false };
		}
	} catch (e) {
		d.error(`${opts.logLabel}: preflight failed`, e);
		return { ok: false };
	}
	return undefined;
}

export async function publishV2ContractStatus(params: {
	signer: NDKUser;
	ids: RuneWriteIds;
	recipientPubkey: string;
	transactionHash: string;
	chainStatus: ContractStatus;
	writeMethod: string;
	/** Encrypted tag on 31006 when non-empty (e.g. taskee completion evidence). */
	completionAttachments?: Attachment[];
	/** Dispute proposal amounts (ether strings), e.g. from `ethers.formatEther`. */
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

export async function runV2SideEffects(
	logLabel: string,
	tasks: ReadonlyArray<{ name: string; run: () => Promise<unknown> }>
): Promise<void> {
	const { failures } = await runParallelNamed([...tasks]);
	if (failures.length > 0) {
		d.warn(`${logLabel}: side effects had failures`, failures);
	}
}
