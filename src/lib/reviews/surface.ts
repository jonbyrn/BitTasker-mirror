import type { ContractWithEvents } from '$lib/types/contract';
import type { Event as NostrEvent } from 'nostr-tools';
import type {
	AttestationEventPayload,
	ReviewEventPayload,
	ReviewReplyEventPayload
} from '@reviews-contracts';
import type {
	PendingReviewRecord,
	ReviewCategoryGroup,
	ReviewCategoryScore,
	ReviewRole as ReviewUiRole,
	ReviewStatsSummary,
	VerifiedReviewRecord
} from '$lib/components/reviews/reviewTypes';
import {
	getReviewContractOutcome,
	getReviewEligibilityState,
	getReviewRolePair,
	getReviewSubjectType,
	type ReviewEligibilityState
} from './review-status';
import type { ReviewTargetSummary } from './review-targets';
import { buildReviewTargetSummary } from './review-targets';

export const DISMISSED_PENDING_SLOT_STORAGE_KEY = 'reviews.dismissed.pending';

export interface PendingReviewState {
	records: PendingReviewRecord[];
	targets: ReviewTargetSummary[];
	targetsById: Map<string, ReviewTargetSummary>;
}

type CategoryDescriptor = {
	id: string;
	label: string;
	description?: string;
	groupId: string;
	groupHeading?: string;
};

const CATEGORY_DESCRIPTOR_MAP: Record<string, CategoryDescriptor> = {
	workQuality: {
		id: 'workQuality',
		label: 'Work quality',
		description: 'Quality of delivered work',
		groupId: 'provider',
		groupHeading: 'Provider feedback'
	},
	experience: {
		id: 'experience',
		label: 'Experience',
		description: 'Overall experience working together',
		groupId: 'provider',
		groupHeading: 'Provider feedback'
	},
	deliverySpeed: {
		id: 'deliverySpeed',
		label: 'Delivery speed',
		description: 'Speed of completion',
		groupId: 'provider',
		groupHeading: 'Provider feedback'
	},
	communication: {
		id: 'communication',
		label: 'Communication',
		description: 'Clarity and responsiveness',
		groupId: 'client',
		groupHeading: 'Client feedback'
	},
	clarity: {
		id: 'clarity',
		label: 'Clarity',
		description: 'Clear scope and expectations',
		groupId: 'client',
		groupHeading: 'Client feedback'
	},
	paymentTimeliness: {
		id: 'paymentTimeliness',
		label: 'Payment timeliness',
		description: 'Promptness of payment and acceptance',
		groupId: 'client',
		groupHeading: 'Client feedback'
	}
};

export function toReviewCategoryScores(
	categoryRatings: ReviewEventPayload['rating']['categoryRatings']
): ReviewCategoryScore[] {
	return Object.entries(categoryRatings).flatMap(([id, value]) => {
		if (typeof value !== 'number') {
			return [];
		}

		const descriptor = CATEGORY_DESCRIPTOR_MAP[id];
		return [
			{
				id,
				label: descriptor?.label ?? id,
				description: descriptor?.description,
				value
			}
		];
	});
}

function summarizeCategoryGroups(reviews: VerifiedReviewRecord[]): ReviewCategoryGroup[] {
	const buckets = new Map<
		string,
		{
			heading?: string;
			items: Map<string, { label: string; description?: string; total: number; count: number }>;
		}
	>();

	for (const review of reviews) {
		for (const category of review.categoryScores ?? []) {
			const descriptor = CATEGORY_DESCRIPTOR_MAP[category.id];
			const groupId = descriptor?.groupId ?? 'other';
			const group = buckets.get(groupId) ?? {
				heading: descriptor?.groupHeading,
				items: new Map()
			};
			const entry = group.items.get(category.id) ?? {
				label: category.label,
				description: category.description,
				total: 0,
				count: 0
			};
			entry.total += category.value;
			entry.count += 1;
			group.items.set(category.id, entry);
			buckets.set(groupId, group);
		}
	}

	return [...buckets.entries()].map(([groupId, group]) => ({
		id: groupId,
		heading: group.heading,
		categories: [...group.items.entries()].map(([id, entry]) => ({
			id,
			label: entry.label,
			description: entry.description,
			value: Number((entry.total / entry.count).toFixed(2))
		}))
	}));
}

function ratingDistribution(reviews: VerifiedReviewRecord[]): Record<1 | 2 | 3 | 4 | 5, number> {
	const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
		1: 0,
		2: 0,
		3: 0,
		4: 0,
		5: 0
	};

	for (const review of reviews) {
		const rounded = Math.max(1, Math.min(5, Math.round(review.overallRating))) as 1 | 2 | 3 | 4 | 5;
		distribution[rounded] += 1;
	}

	return distribution;
}

function getContractId(contract: ContractWithEvents): string {
	return contract.escrowData?.id ?? contract.contractEvent.content.escrowId;
}

function getSubjectLabel(contract: ContractWithEvents): string | null {
	return (
		contract.contractEvent.content.contextTitle ??
		contract.contractEvent.content.serviceTitle ??
		contract.contractEvent.content.taskTitle ??
		null
	);
}

function getLatestCompletionTimestamp(contract: ContractWithEvents): number {
	const timestamps = contract.statusEvents
		.map((event) => event.content?.timestamp ?? event.created_at)
		.filter(
			(value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
		);

	const latest =
		timestamps.length > 0 ? Math.max(...timestamps) : contract.contractEvent.created_at;
	return latest;
}

export function getPendingReviewSlotKey(
	contract: ContractWithEvents,
	currentUserPubkey: string
): string {
	const contractId = getContractId(contract);
	const roles = getReviewRolePair(contract);
	return `review-slot:${currentUserPubkey}:${contractId}:${roles.reviewerRole}`;
}

export function buildPendingReviewRecord(
	contract: ContractWithEvents,
	currentUserPubkey: string,
	existingAttestations: { subjectId: string; settlementId: string }[] = []
): PendingReviewRecord | null {
	const state = getReviewEligibilityState(contract, existingAttestations);
	if (state !== 'available' && state !== 'submitted') {
		return null;
	}

	const revieweePubkey = contract.isClient
		? contract.contractEvent.content.freelancerPubkey
		: contract.contractEvent.content.clientPubkey;

	if (!revieweePubkey || revieweePubkey === currentUserPubkey) {
		return null;
	}

	const subjectType = getReviewSubjectType(contract);
	const settlementType =
		contract.contractEvent.content.contextType === 'service'
			? contract.contractEvent.content.purchaseMode === 'instant_buy'
				? 'instant_buy_contract'
				: 'service_quote_contract'
			: 'escrow';
	const outcome = getReviewContractOutcome(contract.status);
	if (!outcome) {
		return null;
	}

	return {
		id: getContractId(contract),
		revieweePubkey,
		subjectType,
		subjectLabel: getSubjectLabel(contract),
		settlementType,
		contractOutcome: outcome,
		createdAt: contract.contractEvent.created_at,
		completedAt: getLatestCompletionTimestamp(contract),
		summary:
			contract.contractEvent.content.contextDescription ??
			contract.contractEvent.content.taskDescription,
		hasReview: state === 'submitted'
	};
}

export function buildPendingReviewRecords(
	contracts: ContractWithEvents[],
	currentUserPubkey: string,
	existingAttestations: { subjectId: string; settlementId: string }[] = [],
	dismissedSlotKeys: Set<string> = new Set()
): PendingReviewRecord[] {
	return buildPendingReviewState(
		contracts,
		currentUserPubkey,
		existingAttestations,
		dismissedSlotKeys
	).records;
}

export function buildPendingReviewState(
	contracts: ContractWithEvents[],
	currentUserPubkey: string,
	existingAttestations: { subjectId: string; settlementId: string }[] = [],
	dismissedSlotKeys: Set<string> = new Set()
): PendingReviewState {
	const entries = contracts
		.filter(
			(contract) => !dismissedSlotKeys.has(getPendingReviewSlotKey(contract, currentUserPubkey))
		)
		.flatMap((contract) => {
			const record = buildPendingReviewRecord(contract, currentUserPubkey, existingAttestations);
			if (!record) {
				return [];
			}

			const revieweePubkey = contract.isClient
				? contract.contractEvent.content.freelancerPubkey
				: contract.contractEvent.content.clientPubkey;

			if (!revieweePubkey) {
				return [];
			}

			return [
				{
					record,
					target: buildReviewTargetSummary(contract, currentUserPubkey, revieweePubkey)
				}
			];
		})
		.sort(
			(left, right) =>
				(right.record.completedAt ?? right.record.createdAt) -
				(left.record.completedAt ?? left.record.createdAt)
		);

	const targetsById = new Map<string, ReviewTargetSummary>();
	for (const entry of entries) {
		targetsById.set(entry.record.id, entry.target);
	}

	return {
		records: entries.map((entry) => entry.record),
		targets: entries.map((entry) => entry.target),
		targetsById
	};
}

export function readDismissedPendingSlotKeys(): Set<string> {
	if (typeof window === 'undefined') {
		return new Set();
	}

	try {
		const raw = window.localStorage.getItem(DISMISSED_PENDING_SLOT_STORAGE_KEY);
		if (!raw) {
			return new Set();
		}

		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? new Set(parsed.filter((value) => typeof value === 'string'))
			: new Set();
	} catch {
		return new Set();
	}
}

export function persistDismissedPendingSlotKeys(value: Set<string>) {
	if (typeof window === 'undefined') {
		return;
	}

	window.localStorage.setItem(DISMISSED_PENDING_SLOT_STORAGE_KEY, JSON.stringify([...value]));
}

export function buildVerifiedReviewRecord(input: {
	reviewEvent: NostrEvent;
	reviewPayload: ReviewEventPayload;
	attestationEvent?: NostrEvent | null;
	attestationPayload?: AttestationEventPayload | null;
	replyEvent?: NostrEvent | null;
	replyPayload?: ReviewReplyEventPayload | null;
}): VerifiedReviewRecord {
	const verificationState =
		input.attestationEvent && input.attestationPayload ? 'verified' : 'pending';

	return {
		id: input.reviewEvent.id,
		reviewDraftHash: input.reviewPayload.reviewDraftHash,
		reviewerPubkey: input.reviewEvent.pubkey,
		revieweePubkey: input.reviewPayload.revieweePubkey,
		subjectType: input.reviewPayload.subjectType,
		subjectId: input.attestationPayload?.subjectId ?? null,
		settlementType: input.reviewPayload.settlementType,
		settlementId: input.attestationPayload?.settlementId ?? null,
		contractOutcome: input.reviewPayload.contractOutcome,
		verificationState,
		createdAt: input.reviewPayload.createdAt,
		overallRating: input.reviewPayload.rating.overallRating,
		content: {
			en: input.reviewPayload.content.en.comment,
			es: input.reviewPayload.content.es.comment,
			authoredLanguage: input.reviewPayload.content.sourceLanguage
		},
		categoryScores: toReviewCategoryScores(input.reviewPayload.rating.categoryRatings),
		attachments: input.reviewPayload.attachments.map((attachment) => ({
			url: attachment.url,
			type: attachment.type,
			alt: attachment.alt,
			size: attachment.size,
			name: attachment.key,
			thumbnailURL: attachment.variants?.sm,
			largeURL: attachment.variants?.lg ?? attachment.url
		})),
		reply:
			input.replyEvent && input.replyPayload
				? {
						id: input.replyEvent.id,
						parentReviewEventId: input.replyPayload.parentReviewEventId,
						revieweePubkey: input.replyPayload.revieweePubkey,
						content: {
							en: input.replyPayload.content.en.comment,
							es: input.replyPayload.content.es.comment,
							authoredLanguage: input.replyPayload.content.sourceLanguage
						},
						createdAt: input.replyPayload.createdAt,
						attachments: input.replyPayload.attachments.map((attachment) => ({
							url: attachment.url,
							type: attachment.type,
							alt: attachment.alt,
							size: attachment.size,
							name: attachment.key,
							thumbnailURL: attachment.variants?.sm,
							largeURL: attachment.variants?.lg ?? attachment.url
						}))
					}
				: null
	};
}

export function buildReviewStatsSummary(reviews: VerifiedReviewRecord[]): ReviewStatsSummary {
	if (reviews.length === 0) {
		return {
			averageRating: 0,
			totalReviews: 0,
			ratingDistribution: ratingDistribution([])
		};
	}

	const averageRating =
		reviews.reduce((total, review) => total + review.overallRating, 0) / reviews.length;

	return {
		averageRating: Number(averageRating.toFixed(2)),
		totalReviews: reviews.length,
		ratingDistribution: ratingDistribution(reviews),
		categoryGroups: summarizeCategoryGroups(reviews),
		recentReviewsCount: reviews.length
	};
}

export function buildReviewComposerCategoryGroups(
	revieweeRole: ReviewUiRole
): ReviewCategoryGroup[] {
	const categoryIds =
		revieweeRole === 'tasker' || revieweeRole === 'client'
			? ['communication', 'clarity', 'paymentTimeliness']
			: ['workQuality', 'experience', 'deliverySpeed'];

	return [
		{
			id: `${revieweeRole}-categories`,
			heading:
				revieweeRole === 'tasker' || revieweeRole === 'client'
					? 'Client feedback'
					: 'Provider feedback',
			categories: categoryIds.map((id) => {
				const descriptor = CATEGORY_DESCRIPTOR_MAP[id];
				return {
					id,
					label: descriptor.label,
					description: descriptor.description,
					value: 0
				};
			})
		}
	];
}

export function toCategoryRatings(
	scores: ReviewCategoryScore[],
	fallbackRole: ReviewUiRole
): ReviewEventPayload['rating']['categoryRatings'] {
	const record = Object.fromEntries(scores.map((score) => [score.id, score.value]));
	if (Object.keys(record).length > 0) {
		return record as ReviewEventPayload['rating']['categoryRatings'];
	}

	if (fallbackRole === 'tasker' || fallbackRole === 'client') {
		return {
			communication: 5,
			clarity: 5,
			paymentTimeliness: 5
		};
	}

	if (fallbackRole === 'provider' || fallbackRole === 'freelancer' || fallbackRole === 'taskee') {
		return {
			workQuality: 5,
			experience: 5,
			deliverySpeed: 5
		};
	}
}

export function isReviewTabHighlightMatch(
	highlight: string | null,
	tab: ReviewEligibilityState | 'given' | 'received',
	recordId: string
): boolean {
	return Boolean(highlight && recordId === highlight && tab);
}
