import type {
	PendingReviewRecord,
	ReviewAttachment,
	ReviewContractOutcome,
	ReviewFilter,
	ReviewLocale,
	ReviewSort,
	ReviewStatsSummary,
	ReviewLocalizedText,
	VerifiedReviewRecord
} from './reviewTypes';

type Translator = (key: string) => string;

function humanizeToken(value: string): string {
	return value
		.replace(/_/g, ' ')
		.trim()
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function translateOrFallback(
	translate: Translator | undefined,
	key: string,
	fallback: string
): string {
	if (!translate) {
		return fallback;
	}

	const translated = translate(key);
	return translated && translated !== key ? translated : fallback;
}

export function normalizeReviewLocale(locale: string | null | undefined): ReviewLocale {
	return locale?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function pickLocalizedText(
	text: ReviewLocalizedText,
	locale: string | null | undefined
): string {
	const normalizedLocale = normalizeReviewLocale(locale);
	return text[normalizedLocale]?.trim() || text.en?.trim() || text.es?.trim() || '';
}

export function formatRelativeTime(timestamp: number, locale: string | null | undefined): string {
	try {
		const diffMs = timestamp - Date.now();
		const absSeconds = Math.abs(diffMs) / 1000;
		const formatter = new Intl.RelativeTimeFormat(locale || undefined, { numeric: 'auto' });

		if (absSeconds < 60) {
			return formatter.format(Math.round(diffMs / 1000), 'second');
		}

		const absMinutes = absSeconds / 60;
		if (absMinutes < 60) {
			return formatter.format(Math.round(diffMs / (60 * 1000)), 'minute');
		}

		const absHours = absMinutes / 60;
		if (absHours < 24) {
			return formatter.format(Math.round(diffMs / (60 * 60 * 1000)), 'hour');
		}

		const absDays = absHours / 24;
		if (absDays < 30) {
			return formatter.format(Math.round(diffMs / (24 * 60 * 60 * 1000)), 'day');
		}

		const absMonths = absDays / 30;
		if (absMonths < 12) {
			return formatter.format(Math.round(diffMs / (30 * 24 * 60 * 60 * 1000)), 'month');
		}

		return formatter.format(Math.round(diffMs / (365 * 24 * 60 * 60 * 1000)), 'year');
	} catch {
		return '';
	}
}

export function formatPubkey(pubkey: string): string {
	if (!pubkey) {
		return '';
	}

	if (pubkey.length <= 18) {
		return pubkey;
	}

	return `${pubkey.slice(0, 12)}...${pubkey.slice(-6)}`;
}

export function getRatingTone(rating: number): 'success' | 'warning' | 'error' | 'neutral' {
	if (!Number.isFinite(rating) || rating <= 0) return 'neutral';
	if (rating >= 4.5) return 'success';
	if (rating >= 3.5) return 'warning';
	return 'error';
}

export function getRatingToneClasses(rating: number): {
	text: string;
	bg: string;
} {
	switch (getRatingTone(rating)) {
		case 'success':
			return { text: 'text-success', bg: 'bg-success' };
		case 'warning':
			return { text: 'text-warning', bg: 'bg-warning' };
		case 'error':
			return { text: 'text-error', bg: 'bg-error' };
		default:
			return { text: 'text-base-content/60', bg: 'bg-base-300' };
	}
}

export function getRoundedRating(rating: number): number {
	return Math.max(0, Math.min(5, Math.round(rating)));
}

export function getReviewSettlementLabel(settlementType: string, translate?: Translator): string {
	switch (settlementType) {
		case 'escrow':
			return translateOrFallback(translate, 'reviews.settlement.escrow', 'Escrow');
		case 'service_quote_contract':
			return translateOrFallback(
				translate,
				'reviews.settlement.service_quote_contract',
				'Service quote'
			);
		case 'instant_buy_contract':
			return translateOrFallback(
				translate,
				'reviews.settlement.instant_buy_contract',
				'Instant buy'
			);
		default:
			return humanizeToken(settlementType);
	}
}

export function getReviewOutcomeLabel(
	contractOutcome: ReviewContractOutcome | string,
	translate?: Translator
): string {
	switch (contractOutcome) {
		case 'completed':
			return translateOrFallback(translate, 'reviews.outcome.completed', 'Completed');
		case 'disputed_resolved_payout':
			return translateOrFallback(
				translate,
				'reviews.outcome.disputed_resolved_payout',
				'Dispute resolved, paid out'
			);
		case 'disputed_resolved_refund':
			return translateOrFallback(
				translate,
				'reviews.outcome.disputed_resolved_refund',
				'Dispute resolved, refunded'
			);
		case 'refunded':
			return translateOrFallback(translate, 'reviews.outcome.refunded', 'Refunded');
		default:
			return humanizeToken(contractOutcome);
	}
}

export function getReviewSubjectLabel(
	subjectType: 'task' | 'service_booking',
	translate?: Translator
): string {
	return translateOrFallback(
		translate,
		subjectType === 'service_booking'
			? 'reviews.context.subject.service_booking'
			: 'reviews.context.subject.task',
		subjectType === 'service_booking' ? 'Service booking' : 'Task'
	);
}

export function getReviewRoleLabel(role: string, translate?: Translator): string {
	switch (role) {
		case 'tasker':
			return translateOrFallback(translate, 'reviews.context.role.tasker', 'Tasker');
		case 'taskee':
			return translateOrFallback(translate, 'reviews.context.role.taskee', 'Taskee');
		case 'client':
			return translateOrFallback(translate, 'reviews.context.role.client', 'Client');
		case 'provider':
			return translateOrFallback(translate, 'reviews.context.role.provider', 'Provider');
		case 'freelancer':
			return translateOrFallback(translate, 'reviews.context.role.freelancer', 'Freelancer');
		default:
			return translateOrFallback(translate, 'reviews.context.role.unknown', humanizeToken(role));
	}
}

export function sortReviews(
	reviews: VerifiedReviewRecord[],
	sortType: ReviewSort
): VerifiedReviewRecord[] {
	const sorted = [...reviews];

	switch (sortType) {
		case 'newest':
			return sorted.sort((a, b) => b.createdAt - a.createdAt);
		case 'oldest':
			return sorted.sort((a, b) => a.createdAt - b.createdAt);
		case 'highest_rating':
			return sorted.sort((a, b) => b.overallRating - a.overallRating);
		case 'lowest_rating':
			return sorted.sort((a, b) => a.overallRating - b.overallRating);
		default:
			return sorted;
	}
}

export function filterReviews(
	reviews: VerifiedReviewRecord[],
	filter?: ReviewFilter
): VerifiedReviewRecord[] {
	if (!filter) {
		return reviews;
	}

	let filtered = reviews;

	if (filter.minRating !== undefined) {
		filtered = filtered.filter((review) => review.overallRating >= filter.minRating!);
	}
	if (filter.maxRating !== undefined) {
		filtered = filtered.filter((review) => review.overallRating <= filter.maxRating!);
	}
	if (filter.hasComment) {
		filtered = filtered.filter((review) => pickLocalizedText(review.content, 'en').length > 0);
	}
	if (filter.hasAttachments) {
		filtered = filtered.filter((review) => (review.attachments?.length ?? 0) > 0);
	}
	if (filter.dateFrom) {
		filtered = filtered.filter((review) => review.createdAt >= filter.dateFrom!);
	}
	if (filter.dateTo) {
		filtered = filtered.filter((review) => review.createdAt <= filter.dateTo!);
	}
	if (filter.subjectType) {
		filtered = filtered.filter((review) => review.subjectType === filter.subjectType);
	}
	if (filter.contractOutcome) {
		filtered = filtered.filter((review) => review.contractOutcome === filter.contractOutcome);
	}

	return filtered;
}

export function isReviewPending(review: PendingReviewRecord): boolean {
	return !review.hasReview;
}

export function attachmentImages(attachments: ReviewAttachment[] = []): ReviewAttachment[] {
	return attachments.filter((attachment) => attachment.type === 'image');
}

export function attachmentVideos(attachments: ReviewAttachment[] = []): ReviewAttachment[] {
	return attachments.filter((attachment) => attachment.type === 'video');
}

export function calculateAverageRating(stats: ReviewStatsSummary): string {
	return stats.totalReviews > 0 ? stats.averageRating.toFixed(1) : '0.0';
}
