import type { Event as NostrEvent, Filter } from 'nostr-tools';
import KINDS from '$lib/utils/constants/kinds';
import type { AttestedReview } from '$lib/types/review';
import { normalizeNostrPubkey, nostrPubkeysMatch } from '$lib/utils/nostr-pubkey';
import { resolveSharedRelays } from '$lib/utils/relayUrls';

function tagValue(event: NostrEvent, name: string): string | undefined {
	return event.tags.find((tag) => tag[0] === name && tag[1])?.[1];
}

/** Kind 6430 reviews are public JSON, same kind production signs before attestation. */
export function attestedFromPlainReview(event: NostrEvent): AttestedReview | null {
	if (event.kind !== KINDS.REVIEW || !event.content.startsWith('{')) return null;
	let body: Record<string, unknown>;
	try {
		body = JSON.parse(event.content) as Record<string, unknown>;
	} catch {
		return null;
	}
	if (body.type !== 'review') return null;
	const rating = body.rating as { overallRating?: unknown } | undefined;
	const overall = rating?.overallRating;
	if (typeof overall !== 'number' || overall < 1 || overall > 5) return null;
	const reviewee = tagValue(event, 'p');
	if (!reviewee) return null;
	const revieweeRole =
		body.revieweeRole === 'tasker' || body.revieweeRole === 'taskee'
			? body.revieweeRole
			: undefined;
	return {
		reviewEventId: event.id,
		attestationEventId: '',
		reviewerPubkey: event.pubkey,
		revieweePubkey: reviewee,
		createdAt: event.created_at ?? 0,
		contractId:
			(typeof body.escrowId === 'string' && body.escrowId) || tagValue(event, 'e') || undefined,
		content: {
			overallRating: overall,
			categoryRatings: { quality: overall, professionalism: overall, timeliness: overall },
			comment: typeof body.comment === 'string' ? body.comment : undefined,
			revieweeRole
		},
		revieweeRole
	};
}

async function readReviews(filter: Filter): Promise<NostrEvent[]> {
	const relays = resolveSharedRelays();
	if (relays.length === 0 || typeof WebSocket === 'undefined') return [];
	const { queryRelayEvents } = await import('$lib/nostr/relayQuery');
	return queryRelayEvents(relays, { kinds: [KINDS.REVIEW], limit: 50, ...filter });
}

export async function plainReviewsForReviewee(pubkey: string): Promise<AttestedReview[]> {
	const hex = normalizeNostrPubkey(pubkey);
	if (!hex) return [];
	const events = await readReviews({ '#p': [hex] });
	return events
		.map(attestedFromPlainReview)
		.filter((review): review is AttestedReview => review !== null)
		.filter((review) => nostrPubkeysMatch(review.revieweePubkey, hex));
}

export async function plainReviewsForSubjects(subjectIds: string[]): Promise<AttestedReview[]> {
	const ids = [...new Set(subjectIds.map((id) => id.trim()).filter(Boolean))];
	if (ids.length === 0) return [];
	const events = await readReviews({ '#t': ids });
	const seen = new Set<string>();
	return events.map(attestedFromPlainReview).filter((review): review is AttestedReview => {
		if (!review || seen.has(review.reviewEventId)) return false;
		seen.add(review.reviewEventId);
		return true;
	});
}

export function mergeReviews(left: AttestedReview[], right: AttestedReview[]): AttestedReview[] {
	const seen = new Set<string>();
	const merged: AttestedReview[] = [];
	for (const review of [...left, ...right]) {
		if (seen.has(review.reviewEventId)) continue;
		seen.add(review.reviewEventId);
		merged.push(review);
	}
	return merged.sort((a, b) => b.createdAt - a.createdAt);
}
