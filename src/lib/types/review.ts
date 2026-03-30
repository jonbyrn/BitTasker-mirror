/**
 * Review types for the secure Merkle tree verified review system
 */

import type { VerifiedReview } from '@bittasker/merkle-review-sdk';

/**
 * Review rating categories for Taskee
 * These categories evaluate service delivery
 */
export interface TaskeeCategoryRatings {
	workQuality: number; // 1-5 - Quality of work delivered
	experience: number; // 1-5 - Level of experience and expertise
	deliverySpeed: number; // 1-5 - How quickly work was completed
}

/**
 * Review rating categories for Tasker
 * These categories evaluate behavior and communication
 */
export interface TaskerCategoryRatings {
	communication: number; // 1-5 - Quality of communication
	clarity: number; // 1-5 - Clarity of requirements and instructions
	paymentTimeliness: number; // 1-5 - Payment speed and timeliness
}

/**
 * Union type for role-specific category ratings
 */
export type RoleSpecificCategoryRatings = TaskeeCategoryRatings | TaskerCategoryRatings;

/**
 * Maps to SDK's fixed structure
 */
export interface LegacyCategoryRatings {
	quality: number; // 1-5
	professionalism: number; // 1-5
	timeliness: number; // 1-5
}

export type CategoryRatings = LegacyCategoryRatings | RoleSpecificCategoryRatings;

export type RevieweeRole = 'tasker' | 'taskee';

/**
 * Review content with ratings
 */
export interface ReviewContentWithRatings {
	overallRating: number; // 1-5
	categoryRatings: CategoryRatings;
	revieweeRole?: RevieweeRole;
	comment?: string;
	photos?: string[]; // URLs or Nostr event IDs for photos
}

/**
 * Verified review from Nostr event
 * Extends VerifiedReview but uses ReviewContentWithRatings for role-specific categories
 */
export interface NostrVerifiedReview extends Omit<VerifiedReview, 'content'> {
	content: ReviewContentWithRatings; // Use our extended content type
	nostrEventId: string;
	nostrRelay?: string;
	escrowId?: string;
}

/**
 * Review aggregation statistics
 * Supports both role-specific and legacy categories
 */
export interface ReviewStats {
	totalReviews: number;
	recentReviewsCount: number;
	averageRating: number;
	// Legacy categories (for backward compatibility)
	averageQuality: number;
	averageProfessionalism: number;
	averageTimeliness: number;
	// Taskee-specific averages (when reviewing freelancers)
	averageWorkQuality?: number;
	averageExperience?: number;
	averageDeliverySpeed?: number;
	// Tasker-specific averages (when reviewing clients)
	averageCommunication?: number;
	averageClarity?: number;
	averagePaymentTimeliness?: number;
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
