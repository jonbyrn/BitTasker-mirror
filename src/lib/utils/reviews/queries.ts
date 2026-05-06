/**
 * NDK-Based Review Queries
 *
 * Queries Nostr relays for kind 6431 attestations and kind 6430 review content.
 */
import KINDS from '$lib/utils/constants/kinds';
import { ndk } from '$lib/nostr/ndk';
import type { NDKSubscription, NDKFilter } from '@nostr-dev-kit/ndk';
import type { AttestedReview } from '$lib/types/review';

function parseAttestation(event: {
	id: string;
	pubkey: string;
	created_at: number;
	content: string;
	tags: string[][];
}): AttestedReview | null {
	try {
		const c = JSON.parse(event.content);
		if (!c.reviewerPubkey || !c.revieweePubkey) return null;
		return {
			reviewEventId: typeof c.reviewEventId === 'string' ? c.reviewEventId : event.id,
			attestationEventId: event.id,
			reviewerPubkey: c.reviewerPubkey,
			revieweePubkey: c.revieweePubkey,
			content: {
				overallRating: 0,
				categoryRatings: { quality: 0, professionalism: 0, timeliness: 0 }
			},
			createdAt: event.created_at ? event.created_at * 1000 : Date.now(),
			contractId: typeof c.settlementId === 'string' ? c.settlementId : undefined
		};
	} catch {
		return null;
	}
}

function dedupe(reviews: AttestedReview[]): AttestedReview[] {
	const seen = new Map<string, AttestedReview>();
	for (const r of reviews) {
		const key = `${r.reviewerPubkey}:${r.revieweePubkey}:${r.contractId ?? ''}`;
		const existing = seen.get(key);
		if (!existing || r.createdAt > existing.createdAt) seen.set(key, r);
	}
	return [...seen.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** One-shot fetch of attestations matching a filter */
async function fetchAttestations(filter: NDKFilter, limit: number): Promise<AttestedReview[]> {
	const reviews: AttestedReview[] = [];

	return new Promise((resolve) => {
		const sub = ndk.subscribe(filter, { closeOnEose: true });
		sub.on('event', (event) => {
			const parsed = parseAttestation(event);
			if (parsed) reviews.push(parsed);
		});
		sub.on('eose', () => resolve(dedupe(reviews).slice(0, limit)));
		sub.start();
	});
}

/** Subscribe to attestations for a user (reviewee) — reactive */
export function subscribeToUserAttestations(
	pubkey: string,
	onEvent: (review: AttestedReview) => void,
	onEose?: () => void
): NDKSubscription {
	const sub = ndk.subscribe({ kinds: [KINDS.ATTESTATION], '#p': [pubkey] }, { closeOnEose: false });
	sub.on('event', (event) => {
		const parsed = parseAttestation(event);
		if (parsed) onEvent(parsed);
	});
	if (onEose) sub.on('eose', onEose);
	return sub;
}

/** Fetch attestations for a user (one-shot) */
export async function getReviewsForUser(
	pubkey: string,
	limit: number = 50
): Promise<AttestedReview[]> {
	return fetchAttestations({ kinds: [KINDS.ATTESTATION], '#p': [pubkey] }, limit);
}

/** Fetch attestations by a reviewer (one-shot) */
export async function getReviewsByReviewer(
	pubkey: string,
	limit: number = 50
): Promise<AttestedReview[]> {
	return fetchAttestations({ kinds: [KINDS.ATTESTATION], authors: [pubkey] }, limit);
}

/** Fetch attestations for a specific contract */
export async function getReviewsForContract(contractId: string): Promise<AttestedReview[]> {
	return fetchAttestations(
		{ kinds: [KINDS.ATTESTATION], '#e': [contractId] },
		Number.MAX_SAFE_INTEGER
	);
}

/** Check if user already reviewed a contract */
export async function hasUserReviewedContract(
	contractId: string,
	reviewerPubkey: string
): Promise<boolean> {
	const reviews = await fetchAttestations(
		{ kinds: [KINDS.ATTESTATION], '#e': [contractId] },
		Number.MAX_SAFE_INTEGER
	);
	return reviews.some((r) => r.reviewerPubkey.toLowerCase() === reviewerPubkey.toLowerCase());
}
