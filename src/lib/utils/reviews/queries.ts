/**
 * NDK-Based Review Queries
 *
 * Queries Nostr relays for kind 6431 attestations and kind 6430 review content.
 * Only returns reviews backed by a valid attestation from the BitTasker verifier.
 */
import KINDS from '$lib/utils/constants/kinds';
import { ndk } from '$lib/nostr/ndk';
import type { NDKSubscription, NDKFilter } from '@nostr-dev-kit/ndk';
import type { AttestedReview } from '$lib/types/review';
import { normalizeNostrPubkey, nostrPubkeysMatch } from '$lib/utils/nostr-pubkey';
import { mergeReviews, plainReviewsForReviewee } from '$lib/utils/reviews/plain-reviews';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('reviews:queries');

async function fetchReviewEventById(eventId: string): Promise<Record<string, unknown> | null> {
	// Rating data is ONLY stored in the review event (kind 6430), not in attestations (pre-update).
	// Updated attestations (v1+) include rating data directly.
	// This fetch is fallback for old attestations without embedded ratings.
	if (!eventId) {
		d.log('fetchReviewEventById: No eventId provided');
		return null;
	}

	try {
		d.log('fetchReviewEventById: Fetching review event:', eventId.slice(0, 8));
		// Use a longer timeout since this is critical for displaying ratings
		const timeoutPromise = new Promise<null>((resolve) => {
			setTimeout(() => {
				d.warn('fetchReviewEventById: Timeout for:', eventId.slice(0, 8));
				resolve(null);
			}, 5000);
		});
		const fetchPromise = ndk.fetchEvent(eventId).then((event) => {
			if (event) {
				d.log('fetchReviewEventById: Found event:', eventId.slice(0, 8));
				return JSON.parse(event.content);
			}
			d.log('fetchReviewEventById: Event not found:', eventId.slice(0, 8));
			return null;
		});
		return await Promise.race([fetchPromise, timeoutPromise]);
	} catch (err) {
		d.error('fetchReviewEventById: Error:', err);
		return null;
	}
}

function extractRatings(reviewPayload: Record<string, unknown>): {
	overallRating: number;
	workQuality: number;
	experience: number;
	deliverySpeed: number;
	communication: number;
	clarity: number;
	paymentTimeliness: number;
	comment: string;
	revieweeRole?: string;
} {
	const rating = (reviewPayload.rating as Record<string, unknown>) || {};
	const catRatings = (rating.categoryRatings as Record<string, number>) || {};
	const content = (reviewPayload.content as Record<string, unknown>) || {};
	const en = (content.en as Record<string, unknown>) || {};

	return {
		overallRating: typeof rating.overallRating === 'number' ? rating.overallRating : 0,
		workQuality: typeof catRatings.workQuality === 'number' ? catRatings.workQuality : 0,
		experience: typeof catRatings.experience === 'number' ? catRatings.experience : 0,
		deliverySpeed: typeof catRatings.deliverySpeed === 'number' ? catRatings.deliverySpeed : 0,
		communication: typeof catRatings.communication === 'number' ? catRatings.communication : 0,
		clarity: typeof catRatings.clarity === 'number' ? catRatings.clarity : 0,
		paymentTimeliness:
			typeof catRatings.paymentTimeliness === 'number' ? catRatings.paymentTimeliness : 0,
		comment: typeof en.comment === 'string' ? en.comment : '',
		revieweeRole:
			typeof reviewPayload.revieweeRole === 'string' ? reviewPayload.revieweeRole : undefined
	};
}

/**
 * Extract ratings from attestation event content.
 *
 * Updated attestations (v1+) include rating and comment directly:
 * - rating.overallRating: number
 * - rating.categoryRatings: object with role-specific keys
 * - comment: string (top-level)
 * - revieweeRole: string (top-level)
 *
 * This eliminates the need to fetch the review event separately.
 */
function extractRatingsFromAttestationContent(
	c: Record<string, unknown>
): ReturnType<typeof extractRatings> | null {
	const rating = c.rating as Record<string, unknown> | undefined;
	if (rating && typeof rating.overallRating === 'number') {
		const catRatings = (rating.categoryRatings as Record<string, number>) || {};
		// Comment is a top-level field in new attestations
		const comment = typeof c.comment === 'string' ? c.comment : '';
		return {
			overallRating: rating.overallRating,
			workQuality: catRatings.workQuality ?? 0,
			experience: catRatings.experience ?? 0,
			deliverySpeed: catRatings.deliverySpeed ?? 0,
			communication: catRatings.communication ?? 0,
			clarity: catRatings.clarity ?? 0,
			paymentTimeliness: catRatings.paymentTimeliness ?? 0,
			comment,
			revieweeRole: (c.revieweeRole as string) || undefined
		};
	}
	return null;
}

function buildCategoryRatings(
	ratings: ReturnType<typeof extractRatings>,
	revieweeRole?: string
): AttestedReview['content']['categoryRatings'] {
	// Preserve role-specific category ratings for proper aggregation
	if (revieweeRole === 'taskee') {
		// Taskee was reviewed - use taskee-specific categories
		if (ratings.workQuality > 0 || ratings.experience > 0 || ratings.deliverySpeed > 0) {
			return {
				workQuality: ratings.workQuality || 0,
				experience: ratings.experience || 0,
				deliverySpeed: ratings.deliverySpeed || 0
			};
		}
	} else if (revieweeRole === 'tasker') {
		// Tasker was reviewed - use tasker-specific categories
		if (ratings.communication > 0 || ratings.clarity > 0 || ratings.paymentTimeliness > 0) {
			return {
				communication: ratings.communication || 0,
				clarity: ratings.clarity || 0,
				paymentTimeliness: ratings.paymentTimeliness || 0
			};
		}
	}

	// Fallback to legacy format for backward compatibility
	return {
		quality: ratings.workQuality || ratings.communication || 0,
		professionalism: ratings.experience || ratings.clarity || 0,
		timeliness: ratings.deliverySpeed || ratings.paymentTimeliness || 0
	};
}

function parseAttestationSync(event: {
	id: string;
	pubkey: string;
	created_at: number;
	content: string;
	tags: string[][];
}): { review: AttestedReview; reviewEventId: string; needsCommentFetch: boolean } | null {
	try {
		const c = JSON.parse(event.content);
		if (!c.reviewerPubkey || !c.revieweePubkey) return null;

		const reviewEventId: string = typeof c.reviewEventId === 'string' ? c.reviewEventId : '';
		const contractId: string | undefined =
			typeof c.settlementId === 'string' ? c.settlementId : undefined;

		// Try to extract ratings from attestation content (new format includes ratings)
		const attestationRatings = extractRatingsFromAttestationContent(c);
		const hasAttestationRatings =
			attestationRatings !== null && attestationRatings.overallRating > 0;

		d.log('parseAttestationSync: Attestation:', event.id.slice(0, 8), {
			hasAttestationRatings,
			reviewEventId: reviewEventId?.slice(0, 8),
			hasRatingField: !!c.rating,
			ratingValue: c.rating?.overallRating
		});

		const ratings = attestationRatings ?? {
			overallRating: 0,
			workQuality: 0,
			experience: 0,
			deliverySpeed: 0,
			communication: 0,
			clarity: 0,
			paymentTimeliness: 0,
			comment: ''
		};

		const revieweeRole = (ratings.revieweeRole || c.revieweeRole) as
			| 'tasker'
			| 'taskee'
			| undefined;

		const review: AttestedReview = {
			reviewEventId,
			attestationEventId: event.id,
			reviewerPubkey: c.reviewerPubkey,
			revieweePubkey: c.revieweePubkey,
			content: {
				overallRating: ratings.overallRating,
				categoryRatings: buildCategoryRatings(ratings, revieweeRole),
				revieweeRole,
				comment: ratings.comment || undefined
			},
			createdAt: event.created_at ? event.created_at * 1000 : Date.now(),
			contractId
		};

		// Only need to fetch review event if attestation doesn't have ratings
		const hasRatings = ratings.overallRating > 0;
		const needsCommentFetch = Boolean(reviewEventId && (!hasRatings || !ratings.comment));

		return { review, reviewEventId, needsCommentFetch };
	} catch (err) {
		d.error('parseAttestationSync: Parse error:', err);
		return null;
	}
}

async function parseAttestation(event: {
	id: string;
	pubkey: string;
	created_at: number;
	content: string;
	tags: string[][];
}): Promise<AttestedReview | null> {
	const parsed = parseAttestationSync(event);
	if (!parsed) return null;

	// Fast path: we already have all data from attestation (ratings present and no comment needed)
	const hasRatings = parsed.review.content.overallRating > 0;
	if (hasRatings && !parsed.needsCommentFetch) {
		return parsed.review;
	}

	// Slow path: try to fetch ratings and comment from review event (with timeout)
	const reviewPayload = await fetchReviewEventById(parsed.reviewEventId);
	if (reviewPayload) {
		const ratings = extractRatings(reviewPayload);

		// Update ratings if we didn't have them
		if (!hasRatings && ratings.overallRating > 0) {
			const revieweeRole = ratings.revieweeRole as 'tasker' | 'taskee' | undefined;
			parsed.review.content.overallRating = ratings.overallRating;
			parsed.review.content.categoryRatings = buildCategoryRatings(ratings, revieweeRole);
			if (revieweeRole) {
				parsed.review.content.revieweeRole = revieweeRole;
			}
		}

		// Update comment
		if (ratings.comment) {
			parsed.review.content.comment = ratings.comment;
		}
	}

	return parsed.review;
}

/**
 * Drop duplicate Nostr events only (same attestation `id` may appear from relay quirks).
 * Do not merge by reviewer/reviewee — `contractId` is often absent from attestation JSON.
 */
function dedupe(reviews: AttestedReview[]): AttestedReview[] {
	const seen = new Map<string, AttestedReview>();
	for (const r of reviews) {
		const id = r.attestationEventId?.trim();
		if (!id) continue;
		const existing = seen.get(id);
		if (!existing || r.createdAt > existing.createdAt) seen.set(id, r);
	}
	return [...seen.values()].sort((a, b) => b.createdAt - a.createdAt);
}

async function fetchAttestations(
	filter: NDKFilter,
	limit: number,
	timeoutMs: number = 8000
): Promise<AttestedReview[]> {
	const reviews: AttestedReview[] = [];
	const pendingCommentFetches: Promise<void>[] = [];

	return new Promise((resolve) => {
		let resolved = false;
		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				resolve(dedupe(reviews).slice(0, limit));
			}
		}, timeoutMs);

		const sub = ndk.subscribe(filter, { closeOnEose: true });

		sub.on('event', (event) => {
			// Fast sync parse - no network request
			const parsed = parseAttestationSync(event);
			if (parsed) {
				reviews.push(parsed.review);

				// Queue review event fetch if we need ratings or comment
				const hasRatings = parsed.review.content.overallRating > 0;
				if (parsed.needsCommentFetch || !hasRatings) {
					pendingCommentFetches.push(
						fetchReviewEventById(parsed.reviewEventId)
							.then((payload) => {
								if (payload) {
									const ratings = extractRatings(payload);

									// Update ratings if missing
									if (!hasRatings && ratings.overallRating > 0) {
										const revieweeRole = ratings.revieweeRole as 'tasker' | 'taskee' | undefined;
										parsed.review.content.overallRating = ratings.overallRating;
										parsed.review.content.categoryRatings = buildCategoryRatings(
											ratings,
											revieweeRole
										);
										if (revieweeRole) {
											parsed.review.content.revieweeRole = revieweeRole;
										}
									}

									// Update comment
									if (ratings.comment) {
										parsed.review.content.comment = ratings.comment;
									}
								}
							})
							.catch(() => {})
					);
				}
			}
		});

		sub.on('eose', async () => {
			// Wait for review event fetches (ratings + comments) with adequate timeout
			// Review event fetches have a 5s timeout, so allow up to 5.5s here
			await Promise.race([
				Promise.all(pendingCommentFetches),
				new Promise((r) => setTimeout(r, 5500))
			]);

			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				resolve(dedupe(reviews).slice(0, limit));
			}
		});

		sub.start();
	});
}

export function subscribeToUserAttestations(
	pubkey: string,
	onEvent: (review: AttestedReview) => void,
	onEose?: () => void
): NDKSubscription {
	const hexPubkey = normalizeNostrPubkey(pubkey);
	if (!hexPubkey) {
		throw new Error('Invalid pubkey for attestation subscription');
	}
	const sub = ndk.subscribe(
		{ kinds: [KINDS.ATTESTATION], '#p': [hexPubkey] },
		{ closeOnEose: false }
	);
	sub.on('event', (event) => {
		parseAttestation(event).then((parsed) => {
			if (parsed) onEvent(parsed);
		});
	});
	if (onEose) sub.on('eose', onEose);
	return sub;
}

export async function getReviewsForUser(
	pubkey: string,
	limit: number = 50
): Promise<AttestedReview[]> {
	const hexPubkey = normalizeNostrPubkey(pubkey);
	if (!hexPubkey) {
		return [];
	}

	// Attestations tag reviewee/reviewer as hex in #p — always query with normalized hex.
	const [attested, plain] = await Promise.all([
		fetchAttestations({ kinds: [KINDS.ATTESTATION], '#p': [hexPubkey] }, limit * 2).catch(
			() => [] as AttestedReview[]
		),
		plainReviewsForReviewee(hexPubkey).catch(() => [] as AttestedReview[])
	]);
	return mergeReviews(attested, plain)
		.filter((r) => nostrPubkeysMatch(r.revieweePubkey, hexPubkey))
		.slice(0, limit);
}

export async function getReviewsByReviewer(
	pubkey: string,
	limit: number = 50
): Promise<AttestedReview[]> {
	const hexPubkey = normalizeNostrPubkey(pubkey);
	if (!hexPubkey) {
		return [];
	}

	const reviews = await fetchAttestations(
		{ kinds: [KINDS.ATTESTATION], '#p': [hexPubkey] },
		limit * 2
	);
	return reviews.filter((r) => nostrPubkeysMatch(r.reviewerPubkey, hexPubkey)).slice(0, limit);
}

export async function getReviewsForContract(contractId: string): Promise<AttestedReview[]> {
	return fetchAttestations(
		{ kinds: [KINDS.ATTESTATION], '#e': [contractId] },
		Number.MAX_SAFE_INTEGER
	);
}

export async function hasUserReviewedContract(
	/** Nostr event ID of the contract — used for #e tag filter on attestations */
	contractEventId: string,
	/** Numeric escrow/payment ID — fallback match against attestation's settlementId field */
	contractPaymentId: string,
	reviewerPubkey: string
): Promise<boolean> {
	// Fast path: query by #e tag (contract Nostr event ID) with short timeout
	const reviews = await fetchAttestations(
		{ kinds: [KINDS.ATTESTATION], '#e': [contractEventId] },
		100,
		3000 // 3 second timeout
	);

	// Check if current user has reviewed
	if (reviews.some((r) => nostrPubkeysMatch(r.reviewerPubkey, reviewerPubkey))) {
		return true;
	}

	// Also check by settlementId if we have reviews but none match the pubkey
	// This handles cases where #e tag wasn't properly set
	if (contractPaymentId && reviews.length === 0) {
		// Fetch recent attestations and filter by reviewerPubkey and contractId
		// (attestations are authored by verifier, not reviewer)
		const fallbackReviews = await fetchAttestations(
			{ kinds: [KINDS.ATTESTATION] },
			200,
			2000 // 2 second timeout for fallback
		);
		return fallbackReviews.some(
			(r) =>
				nostrPubkeysMatch(r.reviewerPubkey, reviewerPubkey) && r.contractId === contractPaymentId
		);
	}

	return false;
}
