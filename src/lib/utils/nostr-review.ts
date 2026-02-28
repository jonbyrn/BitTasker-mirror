/**
 * Nostr Review — client-side only (kind 1985, NIP-33 replaceable).
 * Publish and read reviews via Nostr events only (no ZKP).
 */

import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { getSignedEvent, publishEvent, subscribeToEvents } from './nostr';
import KINDS from './constants/kinds';
import type {
	NostrVerifiedReview,
	ReviewContentWithRatings,
	ReviewEventContent,
	RevieweeRole
} from '$lib/types/review';
import { escrow } from '$lib/utils/wallet/escrow';
import { EscrowStatus } from '$lib/utils/escrow';

const DEFAULT_RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean);

async function pubkeyToHex(pubkey: string): Promise<string> {
	if (!pubkey) return '';
	const p = pubkey.trim().toLowerCase();
	if (p.startsWith('npub')) {
		const { nip19 } = await import('nostr-tools');
		const decoded = nip19.decode(p);
		return (decoded.data as string) ?? '';
	}
	return p.startsWith('0x') ? p.slice(2) : p;
}

/** Parse kind-1985 (or legacy 31007) event into NostrVerifiedReview for UI. */
function parseReviewEvent(event: NostrEvent, relayUrl: string): NostrVerifiedReview | null {
	try {
		const isNewFormat = event.kind === 1985;
		if (isNewFormat) {
			const data = JSON.parse(event.content) as ReviewEventContent;
			const escrowId = event.tags.find((t) => t[0] === 'escrow')?.[1] ?? event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
			const revieweePubkey = event.tags.find((t) => t[0] === 'p')?.[1] ?? '';
			const revieweeRole = (event.tags.find((t) => t[0] === 'reviewee_role')?.[1] ?? data.revieweeRole ?? '') as RevieweeRole;
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
			content: { overallRating: number; categoryRatings: Record<string, number>; comment?: string; photos?: string[] };
			fullContent?: ReviewContentWithRatings;
			createdAt: number;
		};
		const roleTag = event.tags.find((t) => t[0] === 'role');
		const revieweeRole = roleTag ? (roleTag[1] as RevieweeRole) : (legacy.fullContent?.revieweeRole as RevieweeRole | undefined);
		const content: ReviewContentWithRatings = legacy.fullContent ?? {
			overallRating: legacy.content.overallRating,
			categoryRatings: legacy.content.categoryRatings,
			revieweeRole,
			comment: legacy.content.comment,
			photos: legacy.content.photos
		};
		const legacyEscrowId = event.tags.find((t) => t[0] === 'e')?.[1] ?? event.tags.find((t) => t[0] === 'escrow')?.[1] ?? event.tags.find((t) => t[0] === 'd')?.[1];
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

/** Publish a review (Nostr only; no ZKP). */
export async function publishReview(
	escrowId: string,
	revieweePubkey: string,
	content: ReviewContentWithRatings,
	taskId: string
): Promise<string> {
	const escrowData = await escrow.getEscrow(escrowId);
	if (!escrowData) throw new Error('Escrow not found');
	const completedStates = [
		EscrowStatus.Completed,
		EscrowStatus.FundsReleased,
		EscrowStatus.DisputeResolved
	];
	if (!completedStates.includes(escrowData.status)) {
		throw new Error(`Escrow is not in a completed state. Current status: ${escrowData.status}`);
	}

	const { getNpub } = await import('$lib/utils/nostrKeys');
	const reviewerPubkey = await getNpub();
	if (!reviewerPubkey) throw new Error('Failed to get reviewer pubkey');

	const revieweeHex = await pubkeyToHex(revieweePubkey);
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
	const { getCount, requiredCount = limit, maxWaitMs = 10000 } = options;
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
				const key = `${event.pubkey}:${event.tags.find((t) => t[0] === 'd')?.[1] ?? event.tags.find((t) => t[0] === 'escrow')?.[1] ?? event.id}`;
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
	await subscribeReviews(filter, limit, (event, relayUrl) => {
		const r = parseReviewEvent(event, relayUrl);
		if (r) reviews.push(r);
	}, { getCount: () => reviews.length, requiredCount: limit });
	return reviews.slice(0, limit);
}

export async function getReviewsByReviewer(
	reviewerPubkey: string,
	limit = 50
): Promise<NostrVerifiedReview[]> {
	const hex = await pubkeyToHex(reviewerPubkey);
	const reviews: NostrVerifiedReview[] = [];
	const filter: Filter = { kinds: REVIEW_KINDS, authors: [hex], limit };
	await subscribeReviews(filter, limit, (event, relayUrl) => {
		const r = parseReviewEvent(event, relayUrl);
		if (r) reviews.push(r);
	}, { getCount: () => reviews.length, requiredCount: limit });
	return reviews.slice(0, limit);
}

export async function getReviewsForUser(
	revieweePubkey: string,
	limit = 50
): Promise<NostrVerifiedReview[]> {
	const hex = await pubkeyToHex(revieweePubkey);
	const reviews: NostrVerifiedReview[] = [];
	const filter: Filter = { kinds: REVIEW_KINDS, '#p': [hex], limit };
	await subscribeReviews(filter, limit, (event, relayUrl) => {
		const r = parseReviewEvent(event, relayUrl);
		if (r) reviews.push(r);
	}, { getCount: () => reviews.length, requiredCount: limit });
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

export async function getReviewsForEscrow(escrowId: string): Promise<NostrVerifiedReview[]> {
	const reviews: NostrVerifiedReview[] = [];
	const seen = new Set<string>();
	const relayUrl = DEFAULT_RELAYS[0] || '';
	if (!relayUrl) return [];
	const push = (event: NostrEvent) => {
		const key = `${event.pubkey}:${event.tags.find((t) => t[0] === 'd')?.[1] ?? event.tags.find((t) => t[0] === 'e')?.[1] ?? event.tags.find((t) => t[0] === 'escrow')?.[1] ?? event.id}`;
		if (seen.has(key)) return;
		seen.add(key);
		const r = parseReviewEvent(event, relayUrl);
		if (r) reviews.push(r);
	};
	await new Promise<void>((resolve) => {
		const unsub1 = subscribeToEvents(relayUrl, [{ kinds: REVIEW_KINDS, '#escrow': [escrowId], limit: 50 }], push);
		const unsub2 = subscribeToEvents(relayUrl, [{ kinds: REVIEW_KINDS, '#e': [escrowId], limit: 50 }], push);
		setTimeout(() => {
			unsub1();
			unsub2();
			resolve();
		}, 10000);
	});
	return reviews;
}

export async function hasUserReviewedEscrow(
	escrowId: string,
	reviewerPubkey: string
): Promise<boolean> {
	const reviews = await getReviewsForEscrow(escrowId);
	const reviewerHex = await pubkeyToHex(reviewerPubkey);
	for (const r of reviews) {
		const rHex = r.reviewerPubkey.length === 64 && /^[a-f0-9]+$/.test(r.reviewerPubkey)
			? r.reviewerPubkey
			: await pubkeyToHex(r.reviewerPubkey);
		if (rHex === reviewerHex) return true;
	}
	return false;
}
