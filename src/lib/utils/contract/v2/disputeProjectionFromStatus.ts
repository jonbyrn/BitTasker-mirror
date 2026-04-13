import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import { ContractStatus } from '$lib/utils/contract/types';
import type { DisputeProjection } from './permittedActions';

export type DisputeProjectionRuneInput = {
	taskerPubkey: string | undefined;
	taskeePubkey: string | undefined;
	statusEventsByNewest: readonly NDKContractStatus[];
};

/**
 * Derives {@link DisputeProjection} from Kind 31006 history + chain state `InDispute` / `InDisputeWorkInProgress`.
 * Events are processed in `created_at` ascending (caller may pass newest-first; we sort internally).
 */
export function disputeProjectionFromStatusEvents(
	taskerPubkey: string | undefined,
	taskeePubkey: string | undefined,
	statusEventsNewestFirst: readonly NDKContractStatus[],
	chainState: number
): DisputeProjection | undefined {
	if (!taskerPubkey || !taskeePubkey) return undefined;
	if (
		chainState !== ContractStatus.InDispute &&
		chainState !== ContractStatus.InDisputeWorkInProgress
	) {
		return undefined;
	}

	const sorted = [...statusEventsNewestFirst].sort(
		(a, b) => (a.created_at ?? 0) - (b.created_at ?? 0)
	);

	let totalProposalCount = 0;
	let lastProposerIsTasker = false;
	let lastProposeIdx = -1;
	let lastAcceptIdx = -1;

	for (let i = 0; i < sorted.length; i++) {
		const ev = sorted[i];
		const wm = ev.tagValue('writeMethod');
		if (wm === 'proposeResolution') {
			totalProposalCount++;
			const author = ev.author?.pubkey;
			lastProposerIsTasker = author === taskerPubkey;
			lastProposeIdx = i;
		}
		if (wm === 'acceptProposal') {
			lastAcceptIdx = i;
		}
	}

	if (totalProposalCount > 4) totalProposalCount = 4;

	const disputeAccepted = lastAcceptIdx > lastProposeIdx && lastProposeIdx >= 0;

	return {
		totalProposalCount,
		lastProposerIsTasker,
		disputeAccepted
	};
}

export function buildDisputeProjectionForPayment(
	rune: DisputeProjectionRuneInput,
	chainState: number
): DisputeProjection | undefined {
	return disputeProjectionFromStatusEvents(
		rune.taskerPubkey,
		rune.taskeePubkey,
		rune.statusEventsByNewest,
		chainState
	);
}

/**
 * Next `proposalNumber` for v2 `proposeResolution(paymentId, taskeeAmount, proposalNumber)`.
 * Matches on-chain indexing: first proposal → `0`, second → `1`, …
 *
 * Uses the same source as dispute projection: Kind 31006 events with `writeMethod` = `proposeResolution`,
 * ordered by `created_at` ascending (caller may pass newest-first; we sort internally).
 */
export function nextProposeResolutionProposalNumberFromStatusEvents(
	statusEventsNewestFirst: readonly NDKContractStatus[]
): number {
	const sorted = [...statusEventsNewestFirst].sort(
		(a, b) => (a.created_at ?? 0) - (b.created_at ?? 0)
	);
	let n = 0;
	for (const ev of sorted) {
		if (ev.tagValue('writeMethod') === 'proposeResolution') n++;
	}
	return n;
}
