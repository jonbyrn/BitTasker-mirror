/**
 * Review Helpers — Version-Agnostic
 *
 * Pending review detection and role resolution.
 */
import type { IContractForReview } from '$lib/utils/reviews/contract-interface';
import {
	isReviewableStatus as isReviewable,
	isConfirmedCompletionAction as isCompletion
} from '$lib/utils/reviews/status-mapper';
import { hasUserReviewedContract } from '$lib/utils/reviews/queries';
import { getNpub } from '$lib/utils/nostrKeys';
import { fetchProfileMetadata } from '$lib/utils/nostr-message';
import { normalizeNostrPubkey, nostrPubkeysMatch } from '$lib/utils/nostr-pubkey';
import { nip19 } from 'nostr-tools';

// ── Status checks ──────────────────────────────────────

export function isReviewableContractStatus(status: string | number | undefined): boolean {
	if (typeof status === 'number') return status === 0 || status >= 4;
	return isReviewable(status);
}

export function isConfirmedReviewCompletionAction(action: string | number | undefined): boolean {
	if (typeof action === 'number') return action === 0 || action >= 4;
	return isCompletion(action);
}

// ── Pending reviews ────────────────────────────────────

export interface PendingReview {
	contract: IContractForReview;
	contractId: string;
	revieweePubkey: string;
	revieweeName?: string;
	completedAt: number;
	canReview: boolean;
}

export class PartialPendingReviewsError extends Error {
	readonly pendingReviews: PendingReview[];
	constructor(message: string, pendingReviews: PendingReview[]) {
		super(message);
		this.name = 'PartialPendingReviewsError';
		this.pendingReviews = pendingReviews;
	}
}

function toProfileLookupPubkey(pubkey: string): string {
	if (pubkey.startsWith('npub')) return pubkey;
	try {
		return nip19.npubEncode(pubkey);
	} catch {
		return pubkey;
	}
}

async function resolveRevieweeName(pubkey: string): Promise<string | undefined> {
	try {
		const profile = await fetchProfileMetadata(toProfileLookupPubkey(pubkey));
		return profile.name || undefined;
	} catch {
		return undefined;
	}
}

function getOtherPartyPubkey(
	contract: IContractForReview,
	currentUserPubkey: string
): string | null {
	if (nostrPubkeysMatch(contract.clientPubkey, currentUserPubkey)) return contract.freelancerPubkey;
	if (nostrPubkeysMatch(contract.freelancerPubkey, currentUserPubkey)) return contract.clientPubkey;
	return null;
}

export async function findPendingReviews(
	contracts: IContractForReview[]
): Promise<PendingReview[]> {
	try {
		const currentUserPubkey = await getNpub();
		if (!currentUserPubkey) return [];

		const reviewable = contracts.filter(
			(c) => c.isReviewable() && c.getReviewableParty(currentUserPubkey) !== null
		);

		let hadPartialFailure = false;
		const pending = (
			await Promise.all(
				reviewable.map(async (contract) => {
					try {
						const userReviewed = await hasUserReviewedContract(
							contract.contractId,
							currentUserPubkey
						);
						if (userReviewed) return null;
						const revieweePubkey = getOtherPartyPubkey(contract, currentUserPubkey);
						if (!revieweePubkey) return null;
						return {
							contract,
							contractId: contract.contractId,
							revieweePubkey,
							revieweeName: await resolveRevieweeName(revieweePubkey),
							completedAt: Date.now(),
							canReview: true
						} as PendingReview;
					} catch {
						hadPartialFailure = true;
						return null;
					}
				})
			)
		).filter((r): r is PendingReview => r !== null);

		const sorted = pending.sort((a, b) => b.completedAt - a.completedAt);
		if (hadPartialFailure) {
			throw new PartialPendingReviewsError('Some pending reviews could not be refreshed.', sorted);
		}
		return sorted;
	} catch (error) {
		if (error instanceof PartialPendingReviewsError) throw error;
		throw error instanceof Error ? error : new Error('Failed to find pending reviews');
	}
}

export async function getPendingReviewsCount(contracts: IContractForReview[]): Promise<number> {
	return (await findPendingReviews(contracts)).length;
}

export function getRevieweeRoleFromContractParticipants(
	clientPubkey: string,
	freelancerPubkey: string,
	revieweePubkey: string
): 'tasker' | 'taskee' | null {
	const r = normalizeNostrPubkey(revieweePubkey);
	if (r === normalizeNostrPubkey(clientPubkey)) return 'tasker';
	if (r === normalizeNostrPubkey(freelancerPubkey)) return 'taskee';
	return null;
}
