/**
 * Review types — client-side only (Nostr kind 1985, NIP-33 replaceable).
 * Reviews are published and read via Nostr events only (no ZKP/Merkle).
 */

/** Nostr kind for review events (replaceable by author + d=escrowId). */
export const REVIEW_EVENT_KIND = 1985;

export type RevieweeRole = 'tasker' | 'taskee';

export const TASKEE_CATEGORY_KEYS = ['workQuality', 'experience', 'deliverySpeed'] as const;
export const TASKER_CATEGORY_KEYS = ['communication', 'clarity', 'paymentTimeliness'] as const;

/** Flat content stored in kind-1985 event (no commitment/proof). */
export interface ReviewEventContent {
	overallRating: number;
	categoryRatings: Record<string, number>;
	comment?: string | null;
	photos?: string[] | null;
	revieweeRole: string;
}

/** Parsed review for display (from Nostr event). */
export interface ReviewDisplay {
	id: string;
	eventId: string;
	taskId: string;
	escrowId: string;
	reviewerPubkey: string;
	revieweePubkey: string;
	revieweeRole: RevieweeRole;
	overallRating: number;
	categoryRatings: Record<string, number>;
	comment?: string | null;
	photos?: string[] | null;
	createdAt: string;
	updatedAt?: string;
}

/**
 * Review rating categories for Taskee
 */
export interface TaskeeCategoryRatings {
	workQuality: number;
	experience: number;
	deliverySpeed: number;
}

/**
 * Review rating categories for Tasker
 */
export interface TaskerCategoryRatings {
	communication: number;
	clarity: number;
	paymentTimeliness: number;
}

export type RoleSpecificCategoryRatings = TaskeeCategoryRatings | TaskerCategoryRatings;

export interface LegacyCategoryRatings {
	quality: number;
	professionalism: number;
	timeliness: number;
}

export type CategoryRatings =
	| TaskeeCategoryRatings
	| TaskerCategoryRatings
	| LegacyCategoryRatings
	| Record<string, number>;

export interface ReviewContentWithRatings {
	overallRating: number;
	categoryRatings: CategoryRatings;
	comment?: string;
	photos?: string[];
	revieweeRole?: 'tasker' | 'taskee';
}

/** Review from Nostr event (used for display; legacy events may have commitment/merkleProof in content). */
export interface NostrVerifiedReview {
	reviewerPubkey: string;
	revieweePubkey: string;
	content: ReviewContentWithRatings;
	createdAt: number;
	nostrEventId: string;
	nostrRelay?: string;
	escrowId?: string;
}

export interface ReviewStats {
	totalReviews: number;
	averageRating: number;
	averageQuality: number;
	averageProfessionalism: number;
	averageTimeliness: number;
	averageWorkQuality?: number;
	averageExperience?: number;
	averageDeliverySpeed?: number;
	averageCommunication?: number;
	averageClarity?: number;
	averagePaymentTimeliness?: number;
	/** Number of reviews received as Taskee (freelancer). */
	taskeeReviewCount?: number;
	/** Number of reviews received as Tasker (client). */
	taskerReviewCount?: number;
	ratingDistribution: {
		1: number;
		2: number;
		3: number;
		4: number;
		5: number;
	};
}

export interface ReviewFilter {
	minRating?: number;
	maxRating?: number;
	hasComment?: boolean;
	hasPhotos?: boolean;
	dateFrom?: number;
	dateTo?: number;
}

export type ReviewSort = 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating';

export interface ReviewReply {
	id: string;
	reviewId: string;
	replierPubkey: string;
	content: string;
	createdAt: number;
	nostrEventId?: string;
}
