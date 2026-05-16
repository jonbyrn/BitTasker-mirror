/**
 * Review types for the attestation-based verified review system.
 *
 * Review content is stored as Nostr kind 6430 events (signed by reviewer).
 * Attestation proof is stored as Nostr kind 6431 events (signed by BitTasker issuer).
 */

import type {
	ReviewChallengeRequest,
	ReviewChallengeResponse,
	ReviewAttestationRequest,
	ReviewAttestationResponse,
	ReviewErrorResponse,
	ReviewIssuerRegistryResponse
} from '@bittasker/reviews-contracts';

export type {
	ReviewChallengeRequest,
	ReviewChallengeResponse,
	ReviewAttestationRequest,
	ReviewAttestationResponse,
	ReviewErrorResponse,
	ReviewIssuerRegistryResponse
};

// ── Reply attestation ──────────────────────────────────

export interface ReplyChallengeRequest {
	parentReviewEventId: string;
	replyDraftHash: string;
	revieweeNpub: string;
	revieweeWallet: string;
}

export interface ReplyAttestationRequest extends ReplyChallengeRequest {
	signedReplyEvent: {
		id: string;
		pubkey: string;
		created_at: number;
		kind: number;
		tags: string[][];
		content: string;
		sig: string;
	};
	challengeToken: string;
	nostrChallengeSignature: string;
	walletChallengeSignature: string;
}

// ── Rating types ───────────────────────────────────────

export interface TaskeeCategoryRatings {
	workQuality: number;
	experience: number;
	deliverySpeed: number;
}

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

export type CategoryRatings = LegacyCategoryRatings | RoleSpecificCategoryRatings;

export type RevieweeRole = 'tasker' | 'taskee';

export interface ReviewContentWithRatings {
	overallRating: number;
	categoryRatings: CategoryRatings;
	revieweeRole?: RevieweeRole;
	comment?: string;
	photos?: string[];
}

// ── Review record ──────────────────────────────────────

export interface AttestedReview {
	reviewEventId: string;
	attestationEventId: string;
	reviewerPubkey: string;
	revieweePubkey: string;
	content: ReviewContentWithRatings;
	createdAt: number;
	contractId?: string;
	settlementType?: string;
	reviewerRole?: string;
	revieweeRole?: string;
}

/**
 * Type alias for backward compatibility.
 * NostrVerifiedReview is the same as AttestedReview - reviews backed by on-chain attestations.
 */
export type NostrVerifiedReview = AttestedReview;

// ── Aggregation ────────────────────────────────────────

export interface ReviewStats {
	totalReviews: number;
	recentReviewsCount: number;
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
	ratingDistribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
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
