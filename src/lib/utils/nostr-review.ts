/**
 * Nostr Review — client-side only (kind 1985, NIP-33 replaceable).
 * Publish and read reviews via Nostr events only (no ZKP).
 */

import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { getSignedEvent, publishEvent, subscribeToEvents } from './nostr';
import { npubToHex } from './nostrKeys';
import KINDS from './constants/kinds';
import type {
	NostrVerifiedReview,
	ReviewContentWithRatings,
	ReviewEventContent,
	RevieweeRole
} from '$lib/types/review';
import { TASKEE_CATEGORY_KEYS, TASKER_CATEGORY_KEYS } from '$lib/types/review';
import { escrow, ESCROW_STATUSES_REVIEW_COMPLETED } from '$lib/utils/escrow';

// Validation limits (same as form — audit #2)
const MIN_RATING = 1;
const MAX_RATING = 5;
const MAX_COMMENT_LENGTH = 1000;
const MAX_PHOTOS = 10;
const MAX_PHOTO_URL_LENGTH = 2048;

const LEGACY_CATEGORY_KEYS = ['quality', 'professionalism', 'timeliness'] as const;
const ALL_CATEGORY_KEYS = new Set<string>([
	...TASKEE_CATEGORY_KEYS,
	...TASKER_CATEGORY_KEYS,
	...LEGACY_CATEGORY_KEYS
]);

//--- Relay Configuration ---
const DEFAULT_RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean);

/** Unique key for a review event (pubkey + identifier from tags) for deduplication. */
function getReviewEventDedupeKey(event: NostrEvent): string {
	const idTag =
		event.tags.find((t) => t[0] === 'd')?.[1] ??
		event.tags.find((t) => t[0] === 'e')?.[1] ??
		event.tags.find((t) => t[0] === 'escrow')?.[1] ??
		event.id;
	return `${event.pubkey}:${idTag}`;
}

/** Parse kind-1985 (or legacy 31007) event into NostrVerifiedReview for UI. */
function parseReviewEvent(event: NostrEvent, relayUrl: string): NostrVerifiedReview | null {
	try {
		const isNewFormat = event.kind === 1985;
		if (isNewFormat) {
			const data = JSON.parse(event.content) as ReviewEventContent;
			const escrowId =
				event.tags.find((t) => t[0] === 'escrow')?.[1] ??
				event.tags.find((t) => t[0] === 'd')?.[1] ??
				'';
			const revieweePubkey = event.tags.find((t) => t[0] === 'p')?.[1] ?? '';
			const revieweeRole = (event.tags.find((t) => t[0] === 'reviewee_role')?.[1] ??
				data.revieweeRole ??
				'') as RevieweeRole;
			const content: ReviewContentWithRatings = {
				overallRating: data.overallRating,
				categoryRatings: data.categoryRatings,
				revieweeRole: revieweeRole || undefined,
				comment: data.comment ?? undefined,
				photos: data.photos ?? undefined
			};
			return {
				reviewerPubkey: event.pubkey,
				revieweePubkey,
				content,
				createdAt: event.created_at * 1000,
				nostrEventId: event.id,
				nostrRelay: relayUrl,
				escrowId: escrowId || undefined
			};
		}
		// Legacy kind 31007
		const legacy = JSON.parse(event.content) as {
			reviewerPubkey: string;
			revieweePubkey: string;
			content: {
				overallRating: number;
				categoryRatings: Record<string, number>;
				comment?: string;
				photos?: string[];
			};
			fullContent?: ReviewContentWithRatings;
			createdAt: number;
		};
		const roleTag = event.tags.find((t) => t[0] === 'role');
		const revieweeRole = roleTag
			? (roleTag[1] as RevieweeRole)
			: (legacy.fullContent?.revieweeRole as RevieweeRole | undefined);
		const content: ReviewContentWithRatings = legacy.fullContent ?? {
			overallRating: legacy.content.overallRating,
			categoryRatings: legacy.content.categoryRatings,
			revieweeRole,
			comment: legacy.content.comment,
			photos: legacy.content.photos
		};
		const legacyEscrowId =
			event.tags.find((t) => t[0] === 'e')?.[1] ??
			event.tags.find((t) => t[0] === 'escrow')?.[1] ??
			event.tags.find((t) => t[0] === 'd')?.[1];
		return {
			reviewerPubkey: legacy.reviewerPubkey ?? event.pubkey,
			revieweePubkey: legacy.revieweePubkey,
			content,
			createdAt: legacy.createdAt ?? event.created_at * 1000,
			nostrEventId: event.id,
			nostrRelay: relayUrl,
			escrowId: legacyEscrowId ?? undefined
		};
	} catch (err) {
		console.error('Failed to parse review event:', err);
		return null;
	}
}

const PUBLISH_REVIEW_ERROR_UNAVAILABLE = 'This task is not available for review.';
const PUBLISH_REVIEW_ERROR_UNAUTHORIZED = "You can't submit a review for this task.";
const PUBLISH_REVIEW_ERROR_INVALID = 'Invalid review data.';

/**
 * Validates review content before publishing (audit #2). Same limits as form.
 * @throws Error with generic message; details logged to console.
 */
function validateReviewContent(content: ReviewContentWithRatings): void {
	const details: string[] = [];

	if (typeof content.overallRating !== 'number' || Number.isNaN(content.overallRating)) {
		details.push('overallRating must be a number');
	} else if (content.overallRating < MIN_RATING || content.overallRating > MAX_RATING) {
		details.push(`overallRating must be between ${MIN_RATING} and ${MAX_RATING}`);
	}

	const categoryRatings = content.categoryRatings;
	if (!categoryRatings || typeof categoryRatings !== 'object' || Array.isArray(categoryRatings)) {
		details.push('categoryRatings must be an object');
	} else {
		for (const [key, value] of Object.entries(categoryRatings)) {
			if (!ALL_CATEGORY_KEYS.has(key)) {
				details.push(`disallowed category key: ${key}`);
			}
			if (
				typeof value !== 'number' ||
				Number.isNaN(value) ||
				value < MIN_RATING ||
				value > MAX_RATING
			) {
				details.push(`category ${key} must be number ${MIN_RATING}-${MAX_RATING}`);
			}
		}
	}

	const comment = content.comment;
	if (comment !== undefined && comment !== null) {
		const s = typeof comment === 'string' ? comment.trim() : '';
		if (s.length > MAX_COMMENT_LENGTH) {
			details.push(`comment length must be ≤ ${MAX_COMMENT_LENGTH}`);
		}
	}

	const photos = content.photos;
	if (photos !== undefined && photos !== null) {
		if (!Array.isArray(photos)) {
			details.push('photos must be an array');
		} else if (photos.length > MAX_PHOTOS) {
			details.push(`photos length must be ≤ ${MAX_PHOTOS}`);
		} else {
			for (let i = 0; i < photos.length; i++) {
				const url = photos[i];
				if (typeof url !== 'string') {
					details.push(`photos[${i}] must be string`);
				} else if (url.length > MAX_PHOTO_URL_LENGTH) {
					details.push(`photos[${i}] URL length must be ≤ ${MAX_PHOTO_URL_LENGTH}`);
				}
			}
		}
	}

	if (details.length > 0) {
		console.error('[publishReview] Validation failed', { details });
		throw new Error(PUBLISH_REVIEW_ERROR_INVALID);
	}
}

/** Publish a review (Nostr only; no ZKP). */
export async function publishReview(
	escrowId: string,
	revieweePubkey: string,
	content: ReviewContentWithRatings,
	taskId: string
): Promise<string> {
	validateReviewContent(content);

	const escrowData = await escrow.getEscrow(escrowId);
	if (!escrowData) {
		console.error('[publishReview] Escrow not found', { escrowId });
		throw new Error(PUBLISH_REVIEW_ERROR_UNAVAILABLE);
	}
	if (!ESCROW_STATUSES_REVIEW_COMPLETED.includes(escrowData.status)) {
		console.error('[publishReview] Escrow not in completed state', {
			escrowId,
			status: escrowData.status
		});
		throw new Error(PUBLISH_REVIEW_ERROR_UNAVAILABLE);
	}

	// Authorization: reviewee must be the other party in this escrow (audit #1)
	const contracts = await escrow.contractOps.getContracts({ escrowIds: [escrowId] });
	const contract = contracts[0];
	if (!contract?.contractEvent?.content) {
		console.error('[publishReview] No contract found for escrow', { escrowId });
		throw new Error(PUBLISH_REVIEW_ERROR_UNAUTHORIZED);
	}
	const clientHex = npubToHex(contract.contractEvent.content.clientPubkey ?? '');
	const freelancerHex = npubToHex(contract.contractEvent.content.freelancerPubkey ?? '');

	const { getNpub } = await import('$lib/utils/nostrKeys');
	const reviewerPubkey = await getNpub();
	if (!reviewerPubkey) {
		console.error('[publishReview] Failed to get reviewer pubkey');
		throw new Error(PUBLISH_REVIEW_ERROR_UNAUTHORIZED);
	}
	const reviewerHex = npubToHex(reviewerPubkey);
	const revieweeHex = npubToHex(revieweePubkey);

	const reviewerIsClient = reviewerHex === clientHex;
	const reviewerIsFreelancer = reviewerHex === freelancerHex;
	const revieweeIsOtherParty =
		(reviewerIsClient && revieweeHex === freelancerHex) ||
		(reviewerIsFreelancer && revieweeHex === clientHex);
	if (!reviewerIsClient && !reviewerIsFreelancer) {
		console.error('[publishReview] Reviewer is not a party to the contract', {
			escrowId,
			reviewerHex: reviewerHex.slice(0, 16) + '…'
		});
		throw new Error(PUBLISH_REVIEW_ERROR_UNAUTHORIZED);
	}
	if (!revieweeIsOtherParty) {
		console.error('[publishReview] Reviewee is not the other party', {
			escrowId,
			revieweeHex: revieweeHex.slice(0, 16) + '…'
		});
		throw new Error(PUBLISH_REVIEW_ERROR_UNAUTHORIZED);
	}
	const categoryRatings = content.categoryRatings as Record<string, number>;
	const revieweeRole = content.revieweeRole ?? 'taskee';

	const eventContent: ReviewEventContent = {
		overallRating: content.overallRating,
		categoryRatings,
		comment: content.comment ?? null,
		photos: content.photos ?? null,
		revieweeRole
	};

	const tags: string[][] = [
		['task', taskId],
		['escrow', escrowId],
		['p', revieweeHex],
		['reviewee_role', revieweeRole],
		['d', escrowId]
	];

	const event: Partial<NostrEvent> = {
		kind: KINDS.REVIEW_VERIFIED,
		created_at: Math.floor(Date.now() / 1000),
		content: JSON.stringify(eventContent),
		tags
	};

	const signedEvent = await getSignedEvent(event);
	await publishEvent(signedEvent);
	return signedEvent.id;
}

/** Update review (replaceable: same author + d=escrowId). Publishes a new event. */
export async function updateReview(
	_originalEventId: string,
	escrowId: string,
	revieweePubkey: string,
	content: ReviewContentWithRatings,
	taskId: string
): Promise<string> {
	return publishReview(escrowId, revieweePubkey, content, taskId);
}

function subscribeReviews(
	filter: Filter,
	limit: number,
	mapEvent: (event: NostrEvent, relayUrl: string) => void,
	options: { getCount?: () => number; requiredCount?: number; maxWaitMs?: number } = {}
): Promise<void> {
	const { getCount, requiredCount = limit, maxWaitMs = 5000 } = options;
	return new Promise((resolve) => {
		const relayUrl = DEFAULT_RELAYS[0] || '';
		if (!relayUrl) {
			resolve();
			return;
		}
		let resolved = false;
		const finish = () => {
			if (resolved) return;
			resolved = true;
			unsub();
			resolve();
		};
		const seen = new Set<string>();
		const unsub = subscribeToEvents(
			relayUrl,
			[filter],
			(event: NostrEvent) => {
				const key = getReviewEventDedupeKey(event);
				if (seen.has(key)) return;
				seen.add(key);
				mapEvent(event, relayUrl);
				if (getCount && getCount() >= requiredCount) finish();
			},
			() => finish()
		);
		setTimeout(finish, maxWaitMs);
	});
}

const REVIEW_KINDS = [KINDS.REVIEW_VERIFIED, KINDS.REVIEW_LEGACY] as number[];

export async function getReviewsByTask(taskId: string, limit = 50): Promise<NostrVerifiedReview[]> {
	const reviews: NostrVerifiedReview[] = [];
	const filter: Filter = { kinds: REVIEW_KINDS, '#task': [taskId], limit };
	await subscribeReviews(
		filter,
		limit,
		(event, relayUrl) => {
			const r = parseReviewEvent(event, relayUrl);
			if (r) reviews.push(r);
		},
		{ getCount: () => reviews.length, requiredCount: limit }
	);
	return reviews.slice(0, limit);
}

export async function getReviewsByReviewer(
	reviewerPubkey: string,
	limit = 50,
	options?: { maxWaitMs?: number }
): Promise<NostrVerifiedReview[]> {
	const hex = npubToHex(reviewerPubkey);
	const reviews: NostrVerifiedReview[] = [];
	const filter: Filter = { kinds: REVIEW_KINDS, authors: [hex], limit };
	await subscribeReviews(
		filter,
		limit,
		(event, relayUrl) => {
			const r = parseReviewEvent(event, relayUrl);
			if (r) reviews.push(r);
		},
		{ getCount: () => reviews.length, requiredCount: limit, maxWaitMs: options?.maxWaitMs }
	);
	return reviews.slice(0, limit);
}

export async function getReviewsForUser(
	revieweePubkey: string,
	limit = 50,
	options?: { maxWaitMs?: number }
): Promise<NostrVerifiedReview[]> {
	const hex = npubToHex(revieweePubkey);
	const reviews: NostrVerifiedReview[] = [];
	const filter: Filter = { kinds: REVIEW_KINDS, '#p': [hex], limit };
	await subscribeReviews(
		filter,
		limit,
		(event, relayUrl) => {
			const r = parseReviewEvent(event, relayUrl);
			if (r) reviews.push(r);
		},
		{ getCount: () => reviews.length, requiredCount: limit, maxWaitMs: options?.maxWaitMs }
	);
	return reviews.slice(0, limit);
}

export async function getReviewByEventId(eventId: string): Promise<NostrVerifiedReview | null> {
	return new Promise((resolve) => {
		const relayUrl = DEFAULT_RELAYS[0] || '';
		if (!relayUrl) {
			resolve(null);
			return;
		}
		let done = false;
		const unsub = subscribeToEvents(
			relayUrl,
			[{ ids: [eventId], kinds: REVIEW_KINDS }],
			(event: NostrEvent) => {
				if (!done) {
					done = true;
					unsub();
					resolve(parseReviewEvent(event, relayUrl));
				}
			}
		);
		setTimeout(() => {
			if (!done) {
				done = true;
				unsub();
				resolve(null);
			}
		}, 5000);
	});
}

const DEFAULT_REVIEWS_FETCH_MS = 10000;

/**
 * Fetch reviews for an escrow. Optional shorter timeout for UI so the "Send Review" button can appear sooner.
 */
export async function getReviewsForEscrow(
	escrowId: string,
	options?: { maxWaitMs?: number }
): Promise<NostrVerifiedReview[]> {
	const maxWaitMs = options?.maxWaitMs ?? DEFAULT_REVIEWS_FETCH_MS;
	const reviews: NostrVerifiedReview[] = [];
	const seen = new Set<string>();
	const relayUrl = DEFAULT_RELAYS[0] || '';
	if (!relayUrl) return [];
	const push = (event: NostrEvent) => {
		const key = getReviewEventDedupeKey(event);
		if (seen.has(key)) return;
		seen.add(key);
		const r = parseReviewEvent(event, relayUrl);
		if (r) reviews.push(r);
	};
	await new Promise<void>((resolve) => {
		const unsub1 = subscribeToEvents(
			relayUrl,
			[{ kinds: REVIEW_KINDS, '#escrow': [escrowId], limit: 50 }],
			push
		);
		const unsub2 = subscribeToEvents(
			relayUrl,
			[{ kinds: REVIEW_KINDS, '#e': [escrowId], limit: 50 }],
			push
		);
		setTimeout(() => {
			unsub1();
			unsub2();
			resolve();
		}, maxWaitMs);
	});
	return reviews;
}

export async function hasUserReviewedEscrow(
	escrowId: string,
	reviewerPubkey: string
): Promise<boolean> {
	const reviews = await getReviewsForEscrow(escrowId);
	const reviewerHex = npubToHex(reviewerPubkey);
	for (const r of reviews) {
		const rHex = npubToHex(r.reviewerPubkey);
		if (rHex === reviewerHex) return true;
	}
	return false;
}
