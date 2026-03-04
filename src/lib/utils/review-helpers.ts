/**
 * Review Helper Utilities
 *
 * Functions to help with review management, finding pending reviews, etc.
 * Reviewee names are resolved from Nostr profile metadata (pubkey → name).
 */

import { escrow } from '$lib/utils/escrow';
import { getReviewsByReviewer, getReviewsForUser, hasUserReviewedEscrow } from './review-source';
import { getReviewsForEscrow } from './nostr-review';
import { getNpub, npubToHex, hexToNpub } from './nostrKeys';
import type { ContractWithEvents } from '$lib/types/contract';
import { EscrowStatus, ESCROW_STATUSES_REVIEW_COMPLETED } from '$lib/utils/escrow';
import { formatStandardDateTimeShort } from '$lib/utils/helpers/dateFormatter';
import { fetchProfileMetadata } from '$lib/utils/nostr-message';

/**
 * Pending review information
 */
export interface PendingReview {
	contract: ContractWithEvents;
	escrowId: string;
	revieweePubkey: string;
	revieweeName?: string;
	completedAt: number;
	canReview: boolean; // Whether current user can review this contract
}

/**
 * Format a completion timestamp (seconds or ms) as date and time using app dateFormatter.
 * Single place for "completed at" formatting to avoid duplicate logic.
 */
export function formatCompletedAt(timestamp: number, locale = 'en'): string {
	if (!timestamp || timestamp <= 0) return '—';
	const ms = timestamp >= 1e12 ? timestamp : timestamp * 1000;
	const date = new Date(ms);
	if (Number.isNaN(date.getTime())) return '—';
	return formatStandardDateTimeShort(date, locale);
}

/**
 * Find all contracts that need reviews from the current user.
 * One "reviews by reviewer" fetch + one contracts fetch, then in-memory filter (no per-escrow queries).
 */
export async function findPendingReviews(): Promise<PendingReview[]> {
	try {
		const currentUserNpub = await getNpub();
		if (!currentUserNpub) {
			return [];
		}
		const currentUserHex = npubToHex(currentUserNpub);

		const [contracts, reviewsGiven] = await Promise.all([
			escrow.contractOps.getContracts({ limit: 100 }),
			getReviewsByReviewer(currentUserNpub, 200)
		]);

		const reviewedEscrowIds = new Set<string>();
		for (const r of reviewsGiven) {
			if (r.escrowId) reviewedEscrowIds.add(r.escrowId);
		}

		const completedContracts = contracts.filter((c) =>
			ESCROW_STATUSES_REVIEW_COMPLETED.includes(c.status)
		);
		const pending: PendingReview[] = [];

		for (const contract of completedContracts) {
			if (reviewedEscrowIds.has(contract.escrowData.id)) continue;
			const content = contract.contractEvent?.content;
			if (!content?.clientPubkey || !content?.freelancerPubkey) continue;
			const clientHex = npubToHex(content.clientPubkey);
			const freelancerHex = npubToHex(content.freelancerPubkey);
			const isClient = clientHex === currentUserHex;
			const revieweePubkey = isClient ? content.freelancerPubkey : content.clientPubkey;
			let completedAt = (contract.contractEvent.created_at || 0) * 1000 || Date.now();
			if (contract.statusEvents?.length) {
				const completionEvent = contract.statusEvents.find((e) =>
					e.content?.action != null
						? ESCROW_STATUSES_REVIEW_COMPLETED.includes(e.content.action as EscrowStatus)
						: false
				);
				if (completionEvent?.content?.timestamp != null) {
					const ts = completionEvent.content.timestamp;
					completedAt = ts >= 1e12 ? ts : ts * 1000;
				}
			}
			pending.push({
				contract,
				escrowId: contract.escrowData.id,
				revieweePubkey,
				revieweeName: undefined,
				completedAt,
				canReview: true
			});
		}

		// Resolve reviewee names from Nostr profile metadata (batch, no per-row fallbacks)
		const uniqueRevieweeHex = [...new Set(pending.map((p) => npubToHex(p.revieweePubkey)))];
		const nameByHex = new Map<string, string>();
		await Promise.all(
			uniqueRevieweeHex.map(async (hex) => {
				try {
					const profile = await fetchProfileMetadata(hexToNpub(hex));
					if (profile?.name?.trim()) nameByHex.set(hex, profile.name.trim());
				} catch {
					// Leave name unset; UI will show — when missing
				}
			})
		);
		for (const p of pending) {
			p.revieweeName = nameByHex.get(npubToHex(p.revieweePubkey));
		}

		return pending.sort((a, b) => b.completedAt - a.completedAt);
	} catch (error) {
		console.error('Failed to find pending reviews:', error);
		return [];
	}
}

/**
 * Check if a contract has been reviewed by the current user
 */
export async function hasUserReviewedContract(escrowId: string): Promise<boolean> {
	try {
		const currentUserPubkey = await getNpub();
		if (!currentUserPubkey) {
			return false;
		}

		return await hasUserReviewedEscrow(escrowId, currentUserPubkey);
	} catch (error) {
		console.error('Failed to check if contract reviewed:', error);
		return false;
	}
}

/** Result of bulk review status fetch: one entry per escrowId. */
export type ReviewStatusByEscrow = Map<string, { userReviewed: boolean; otherPartyReviewed: boolean }>;

/**
 * Fetch review status for all given contracts with exactly two relay subscriptions (not per contract).
 * Use this on the contracts list to avoid "Maximum concurrent subscription count reached".
 * - Subscription 1: all reviews by current user (authors=[me])
 * - Subscription 2: all reviews where current user is reviewee (#p=[me])
 */
export async function getReviewStatusBulk(
	contracts: ContractWithEvents[]
): Promise<ReviewStatusByEscrow> {
	const result: ReviewStatusByEscrow = new Map();
	const currentUserNpub = await getNpub();
	if (!currentUserNpub) return result;
	const currentUserHex = npubToHex(currentUserNpub);

	const reviewable = contracts.filter(
		(c) =>
			c.status === EscrowStatus.FundsReleased ||
			c.status === EscrowStatus.Completed ||
			c.status === EscrowStatus.DisputeResolved
	);
	if (reviewable.length === 0) return result;

	const [myReviews, reviewsAboutMe] = await Promise.all([
		getReviewsByReviewer(currentUserNpub, 250),
		getReviewsForUser(currentUserNpub, 250)
	]);

	const userReviewedEscrows = new Set(
		myReviews.map((r) => r.escrowId).filter((id): id is string => Boolean(id))
	);
	const otherPartyReviewedKeys = new Set(
		reviewsAboutMe
			.map((r) => {
				const eid = r.escrowId;
				const reviewerHex = npubToHex(r.reviewerPubkey);
				return eid && reviewerHex ? `${eid}:${reviewerHex}` : null;
			})
			.filter((k): k is string => Boolean(k))
	);

	for (const contract of reviewable) {
		const escrowId = contract.escrowData.id;
		const userReviewed = userReviewedEscrows.has(escrowId);
		const otherPartyHex = getOtherPartyPubkey(contract, currentUserHex);
		const otherPartyReviewed =
			Boolean(otherPartyHex) && otherPartyReviewedKeys.has(`${escrowId}:${otherPartyHex}`);
		result.set(escrowId, { userReviewed, otherPartyReviewed });
	}
	return result;
}

/**
 * Fetch review status for a contract in one call: userReviewed and otherPartyReviewed.
 * Relay-only (no cache); uses shorter maxWaitMs so the contract page gets the result quickly.
 * Prefer getReviewStatusBulk when rendering a list of contracts to avoid subscription explosion.
 */
export async function getReviewStatusForContract(
	escrowId: string,
	contract: ContractWithEvents,
	options?: { maxWaitMs?: number }
): Promise<{ userReviewed: boolean; otherPartyReviewed: boolean }> {
	const currentUserNpub = await getNpub();
	if (!currentUserNpub) return { userReviewed: false, otherPartyReviewed: false };
	const currentUserHex = npubToHex(currentUserNpub);
	const otherPartyHex = getOtherPartyPubkey(contract, currentUserHex);

	const reviews = await getReviewsForEscrow(escrowId, { maxWaitMs: options?.maxWaitMs ?? 4000 });
	const userReviewed = reviews.some((r) => npubToHex(r.reviewerPubkey) === currentUserHex);
	const otherPartyReviewed = otherPartyHex
		? reviews.some((r) => npubToHex(r.reviewerPubkey) === otherPartyHex)
		: false;
	return { userReviewed, otherPartyReviewed };
}

/**
 * Get the other party's pubkey for a contract
 * Returns the Taskee's pubkey if current user is the client, or the client's pubkey if current user is the Taskee
 */
export function getOtherPartyPubkey(
	contract: ContractWithEvents,
	currentUserPubkey: string
): string | null {
	const content = contract.contractEvent?.content;
	if (!content?.clientPubkey || !content?.freelancerPubkey) {
		return null;
	}
	if (content.clientPubkey === currentUserPubkey) {
		return content.freelancerPubkey;
	}
	if (content.freelancerPubkey === currentUserPubkey) {
		return content.clientPubkey;
	}
	return null;
}

/**
 * Get count of pending reviews for current user
 */
export async function getPendingReviewsCount(): Promise<number> {
	const pending = await findPendingReviews();
	return pending.length;
}

/**
 * Determine if a reviewee is a Tasker (client) or Taskee (freelancer) based on contract
 * @param escrowId - The escrow ID
 * @param revieweePubkey - The reviewee's pubkey (can be hex or npub format)
 * @returns 'tasker' if reviewee is client, 'taskee' if freelancer, null if cannot determine
 */
export async function getRevieweeRole(
	escrowId: string,
	revieweePubkey: string
): Promise<'tasker' | 'taskee' | null> {
	try {
		const contracts = await escrow.contractOps.getContracts({ escrowIds: [escrowId] });
		
		if (contracts.length === 0) {
			return null;
		}

		const content = contracts[0].contractEvent?.content;
		if (!content?.clientPubkey || !content?.freelancerPubkey) {
			return null;
		}

		const normalizedReviewee = npubToHex(revieweePubkey).toLowerCase();
		const normalizedClient = npubToHex(content.clientPubkey).toLowerCase();
		const normalizedFreelancer = npubToHex(content.freelancerPubkey).toLowerCase();

		if (normalizedReviewee === normalizedClient) {
			return 'tasker'; // Reviewee is the client (Tasker)
		} else if (normalizedReviewee === normalizedFreelancer) {
			return 'taskee'; // Reviewee is the freelancer (Taskee)
		}

		return null;
	} catch (error) {
		console.error('Failed to determine reviewee role:', error);
		return null;
	}
}

