import { ethers } from 'ethers';
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';

export type PendingResolutionProposal = {
	taskerWei: bigint;
	taskeeWei: bigint;
	/** Author of the proposeResolution Kind 31006 */
	proposerPubkey: string;
	proposerIsTasker: boolean;
	createdAt: number;
};

/**
 * Parses wei amounts from a `proposeResolution` status event.
 */
export function parseProposalAmountsWei(ev: NDKContractStatus): {
	taskerWei: bigint;
	taskeeWei: bigint;
} | null {
	const tt = ev.proposedTaskerAmount;
	const tk = ev.proposedTaskeeAmount;
	if (!tt || !tk) return null;
	try {
		return {
			taskerWei: ethers.parseEther(tt),
			taskeeWei: ethers.parseEther(tk)
		};
	} catch {
		return null;
	}
}

/**
 * When chain is in dispute, returns the **active** latest `proposeResolution` event
 * (last propose that is not superseded by a later `acceptProposal` in the timeline).
 */
export function getPendingResolutionProposalFromStatusEvents(
	statusEvents: readonly NDKContractStatus[],
	taskerPubkey: string | undefined,
	taskeePubkey: string | undefined
): PendingResolutionProposal | null {
	if (!taskerPubkey || !taskeePubkey) return null;

	const sorted = [...statusEvents].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

	let lastProposeIdx = -1;
	let lastAcceptIdx = -1;
	let lastProposeEvent: NDKContractStatus | null = null;

	for (let i = 0; i < sorted.length; i++) {
		const wm = sorted[i].tagValue('writeMethod');
		if (wm === 'proposeResolution') {
			lastProposeIdx = i;
			lastProposeEvent = sorted[i];
		}
		if (wm === 'acceptProposal') {
			lastAcceptIdx = i;
		}
	}

	if (!lastProposeEvent || lastProposeIdx < lastAcceptIdx) return null;

	const amounts = parseProposalAmountsWei(lastProposeEvent);
	if (!amounts) return null;

	const author = lastProposeEvent.author?.pubkey;
	if (!author) return null;

	return {
		...amounts,
		proposerPubkey: author,
		proposerIsTasker: author === taskerPubkey,
		createdAt: lastProposeEvent.created_at ?? 0
	};
}

export function displayPercentOfPool(shareWei: bigint, poolWei: bigint): string {
	if (poolWei === 0n) return '0%';
	const basisPoints = (shareWei * 10000n) / poolWei;
	const pct = Number(basisPoints) / 100;
	if (!Number.isFinite(pct)) return '—';
	const rounded = Math.round(pct * 10) / 10;
	if (rounded % 1 === 0) return `${Math.round(rounded)}%`;
	return `${rounded.toFixed(1)}%`;
}
