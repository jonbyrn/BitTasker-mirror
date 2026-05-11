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
import { ndk } from '$lib/nostr/ndk';
import { fetchContractsForReview } from '$lib/utils/contract/reviewContractsFromNdk';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('reviews:helpers');

// ── Status checks ──────────────────────────────────────

export function isReviewableContractStatus(status: string | number | undefined): boolean {
	// Delegate to status-mapper which handles both string and numeric values
	return isReviewable(status);
}

export function isConfirmedReviewCompletionAction(action: string | number | undefined): boolean {
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
		const user = ndk.getUser({ pubkey });
		return user.npub;
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

export function getOtherPartyPubkey(
	contract: IContractForReview,
	currentUserPubkey: string
): string | null {
	if (nostrPubkeysMatch(contract.clientPubkey, currentUserPubkey)) return contract.freelancerPubkey;
	if (nostrPubkeysMatch(contract.freelancerPubkey, currentUserPubkey)) return contract.clientPubkey;
	return null;
}

/**
 * Fetches user's contracts and adapts them to IContractForReview format.
 * Used when findPendingReviews is called without contracts.
 */
async function fetchUserContracts(): Promise<IContractForReview[]> {
	try {
		const list = await fetchContractsForReview({ limit: 100 });
		d.log('fetchUserContracts: Fetched contracts (NDK):', list.length);
		return list;
	} catch (err) {
		d.error('fetchUserContracts: Error fetching contracts:', err);
		return [];
	}
}

export async function findPendingReviews(
	contracts?: IContractForReview[]
): Promise<PendingReview[]> {
	try {
		const currentUserPubkey = await getNpub();
		d.log('findPendingReviews: Current user pubkey:', currentUserPubkey?.slice(0, 16));
		if (!currentUserPubkey) return [];

		// If contracts not provided, fetch them
		const contractList = contracts ?? (await fetchUserContracts());
		d.log('findPendingReviews: Contract list length:', contractList?.length ?? 0);
		if (!contractList || contractList.length === 0) return [];

		// Debug each contract's reviewability
		contractList.forEach((c) => {
			const isReviewable = c.isReviewable();
			const reviewableParty = c.getReviewableParty(currentUserPubkey);
			d.log('findPendingReviews: Contract check:', {
				id: c.contractId.slice(0, 8),
				status: c.status,
				isReviewable,
				reviewableParty,
				clientPubkey: c.clientPubkey?.slice(0, 8),
				freelancerPubkey: c.freelancerPubkey?.slice(0, 8)
			});
		});

		const reviewable = contractList.filter(
			(c) => c.isReviewable() && c.getReviewableParty(currentUserPubkey) !== null
		);
		d.log('findPendingReviews: Reviewable contracts:', reviewable.length);

		let hadPartialFailure = false;
		const pending = (
			await Promise.all(
				reviewable.map(async (contract) => {
					try {
						const userReviewed = await hasUserReviewedContract(
							contract.contractId,
							contract.paymentId,
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
