export type ReviewRole = 'tasker' | 'taskee' | 'client' | 'provider' | 'freelancer';
export type ReviewViewTab = 'received' | 'given' | 'pending';
export type ReviewVerificationState = 'verified' | 'unverified' | 'pending' | 'invalid';
export type ReviewContractOutcome =
	| 'completed'
	| 'disputed_resolved_payout'
	| 'disputed_resolved_refund'
	| 'refunded';
export type ReviewLocale = 'en' | 'es';

export interface ReviewLocalizedText {
	en: string;
	es: string;
	authoredLanguage?: ReviewLocale;
	translatedLanguage?: ReviewLocale;
}

export interface ReviewCategoryScore {
	id: string;
	label: string;
	value: number;
	description?: string;
}

export interface ReviewAttachment {
	url: string;
	type: 'image' | 'video';
	alt?: string;
	width?: number;
	height?: number;
	thumbnailURL?: string;
	largeURL?: string;
	name?: string;
	size?: number;
}

export interface ReviewReplyRecord {
	id: string;
	parentReviewEventId: string;
	revieweePubkey: string;
	revieweeLabel?: string | null;
	content: ReviewLocalizedText;
	createdAt: number;
	attachments?: ReviewAttachment[];
}

export interface VerifiedReviewRecord {
	id: string;
	reviewDraftHash: string;
	reviewerPubkey: string;
	revieweePubkey: string;
	reviewerLabel?: string | null;
	revieweeLabel?: string | null;
	subjectType: 'task' | 'service_booking';
	subjectId?: string | null;
	subjectLabel?: string | null;
	settlementType: string;
	settlementId?: string | null;
	contractOutcome: ReviewContractOutcome;
	verificationState?: ReviewVerificationState;
	createdAt: number;
	overallRating: number;
	content: ReviewLocalizedText;
	categoryScores?: ReviewCategoryScore[];
	attachments?: ReviewAttachment[];
	reply?: ReviewReplyRecord | null;
}

export interface PendingReviewRecord {
	id: string;
	revieweePubkey: string;
	revieweeLabel?: string | null;
	subjectType: 'task' | 'service_booking';
	subjectLabel?: string | null;
	settlementType: string;
	contractOutcome: ReviewContractOutcome;
	createdAt: number;
	completedAt?: number;
	summary?: string;
	hasReview?: boolean;
}

export interface ReviewCategoryGroup {
	id: string;
	heading?: string;
	categories: ReviewCategoryScore[];
}

export interface ReviewStatsSummary {
	averageRating: number;
	totalReviews: number;
	ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
	categoryGroups?: ReviewCategoryGroup[];
	recentReviewsCount?: number;
}

export interface ReviewFilter {
	minRating?: number;
	maxRating?: number;
	hasComment?: boolean;
	hasAttachments?: boolean;
	dateFrom?: number;
	dateTo?: number;
	subjectType?: 'task' | 'service_booking';
	contractOutcome?: ReviewContractOutcome;
}

export type ReviewSort = 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating';

export interface ReviewComposerCategory {
	id: string;
	label: string;
	description?: string;
	value: number;
}

export interface ReviewComposerCategoryGroup {
	id: string;
	heading?: string;
	categories: ReviewComposerCategory[];
}

export interface ReviewDraftSubmission {
	overallRating: number;
	content: ReviewLocalizedText;
	categoryScores?: ReviewCategoryScore[];
	attachments?: ReviewAttachment[];
}
