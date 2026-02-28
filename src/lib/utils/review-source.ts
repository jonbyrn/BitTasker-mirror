/**
 * Review source — client-side only (Nostr).
 * No backend review endpoints; all read/write via Nostr.
 */

import {
	getReviewsForUser as nostrGetReviewsForUser,
	getReviewsByReviewer as nostrGetReviewsByReviewer,
	getReviewsForEscrow as nostrGetReviewsForEscrow,
	hasUserReviewedEscrow as nostrHasUserReviewedEscrow
} from './nostr-review';
import { calculateReviewStats } from './review-aggregation';
import type { NostrVerifiedReview, ReviewStats } from '$lib/types/review';

export async function getReviewsForUser(
	revieweePubkey: string,
	limit = 50
): Promise<NostrVerifiedReview[]> {
	return nostrGetReviewsForUser(revieweePubkey, limit);
}

export async function getReviewsByReviewer(
	reviewerPubkey: string,
	limit = 50
): Promise<NostrVerifiedReview[]> {
	return nostrGetReviewsByReviewer(reviewerPubkey, limit);
}

export async function getReviewsForEscrow(escrowId: string): Promise<NostrVerifiedReview[]> {
	return nostrGetReviewsForEscrow(escrowId);
}

export async function getStatsForUser(revieweePubkey: string): Promise<ReviewStats> {
	const reviews = await nostrGetReviewsForUser(revieweePubkey, 500);
	return calculateReviewStats(reviews);
}

export async function hasUserReviewedEscrow(
	escrowId: string,
	reviewerPubkey: string
): Promise<boolean> {
	return nostrHasUserReviewedEscrow(escrowId, reviewerPubkey);
}
