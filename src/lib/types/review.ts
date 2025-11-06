/**
 * Review types for the secure Merkle tree verified review system
 */

import type { VerifiedReview, ReviewContent } from '@bittasker/merkle-review-sdk';

/**
 * Review rating categories
 */
export interface CategoryRatings {
	quality: number; // 1-5
	professionalism: number; // 1-5
	timeliness: number; // 1-5
}

/**
 * Review content with ratings
 */
export interface ReviewContentWithRatings {
	overallRating: number; // 1-5
	categoryRatings: CategoryRatings;
	comment?: string;
	photos?: string[]; // URLs or Nostr event IDs for photos
}

/**
 * Verified review from Nostr event
 */
export interface NostrVerifiedReview extends VerifiedReview {
	nostrEventId: string;
	nostrRelay?: string;
}

/**
 * Review aggregation statistics
 */
export interface ReviewStats {
	totalReviews: number;
	averageRating: number;
	averageQuality: number;
	averageProfessionalism: number;
	averageTimeliness: number;
	ratingDistribution: {
		1: number;
		2: number;
		3: number;
		4: number;
		5: number;
	};
}

/**
 * Review filter options
 */
export interface ReviewFilter {
	minRating?: number;
	maxRating?: number;
	hasComment?: boolean;
	hasPhotos?: boolean;
	dateFrom?: number;
	dateTo?: number;
}

/**
 * Review sort options
 */
export type ReviewSort = 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating';

/**
 * Review reply
 */
export interface ReviewReply {
	id: string;
	reviewId: string;
	replierPubkey: string;
	content: string;
	createdAt: number;
	nostrEventId?: string;
}

