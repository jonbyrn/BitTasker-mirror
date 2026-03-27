/**
 * Nostr Review Utilities
 *
 * Functions for publishing and retrieving verified reviews via Nostr
 */

import { nip19, type Event as NostrEvent, type Filter } from 'nostr-tools';
import { publishEvent, subscribeToEvents } from './nostr';
import KINDS from './constants/kinds';
import {
	createEscrowCommitment,
	getCommitmentProof,
	verifyReview,
	getLatestTreeVersion,
	retrieveMerkleTree
} from '$lib/services/review-verification.service';
import type { VerifiedReview } from '@bittasker/merkle-review-sdk';
import { EscrowStatus } from '$lib/utils/escrow';
import { escrow } from '$lib/utils/wallet/escrow';
import { getUserContracts } from './nostr-bid';
import { getNpub } from '$lib/utils/nostrKeys';
import type {
	NostrVerifiedReview,
	ReviewContentWithRatings,
	RevieweeRole,
	TaskeeCategoryRatings,
	TaskerCategoryRatings
} from '$lib/types/review';

/**
 * Extended review format stored in Nostr events
 * Includes both SDK format (for verification) and role-specific categories
 */
interface ExtendedVerifiedReview extends VerifiedReview {
	fullContent?: ReviewContentWithRatings;
}

function normalizePubkey(pubkey: string | null | undefined): string | null {
	if (!pubkey) {
		return null;
	}

	try {
		if (pubkey.startsWith('npub')) {
			const decoded = nip19.decode(pubkey);
			if (decoded.type === 'npub' && typeof decoded.data === 'string') {
				return decoded.data.toLowerCase();
			}
		}
	} catch {
		// Fall through to lowercase fallback below.
	}

	return pubkey.toLowerCase();
}

function pubkeysMatch(left: string | null | undefined, right: string | null | undefined): boolean {
	const normalizedLeft = normalizePubkey(left);
	const normalizedRight = normalizePubkey(right);

	return normalizedLeft !== null && normalizedRight !== null && normalizedLeft === normalizedRight;
}

function toReviewMapKey(
	review: Pick<NostrVerifiedReview, 'commitment' | 'reviewerPubkey'>
): string {
	return `${review.commitment}:${normalizePubkey(review.reviewerPubkey) ?? review.reviewerPubkey}`;
}

function getTagValue(event: NostrEvent, tagName: string): string | undefined {
	return event.tags.find((tag) => tag[0] === tagName)?.[1];
}

interface AuthorizedReviewContext {
	reviewerPubkey: string;
	revieweePubkey: string;
	escrowTxHash: string;
}

async function resolveAuthorizedReviewContext(
	escrowId: string,
	requestedRevieweePubkey: string,
	escrowTxHash?: string
): Promise<AuthorizedReviewContext> {
	const reviewerPubkey = await getNpub();
	if (!reviewerPubkey) {
		throw new Error('Failed to get reviewer pubkey');
	}

	const contracts = await getUserContracts({ escrowIds: [escrowId], limit: 1 });
	const contractContent = contracts[0]?.contractEvent?.content;
	if (!contractContent) {
		throw new Error('Contract not found for escrow');
	}

	const normalizedReviewer = normalizePubkey(reviewerPubkey);
	const normalizedClient = normalizePubkey(contractContent.clientPubkey);
	const normalizedFreelancer = normalizePubkey(contractContent.freelancerPubkey);

	if (!normalizedReviewer || !normalizedClient || !normalizedFreelancer) {
		throw new Error('Contract participants are missing valid pubkeys');
	}

	let expectedRevieweePubkey: string;
	if (normalizedReviewer === normalizedClient) {
		expectedRevieweePubkey = contractContent.freelancerPubkey;
	} else if (normalizedReviewer === normalizedFreelancer) {
		expectedRevieweePubkey = contractContent.clientPubkey;
	} else {
		throw new Error('Reviewer is not a participant in this contract');
	}

	if (!pubkeysMatch(requestedRevieweePubkey, expectedRevieweePubkey)) {
		throw new Error('Reviewee is not the counterparty for this contract');
	}

	const resolvedEscrowTxHash = escrowTxHash ?? contractContent.transactionHash;
	if (!resolvedEscrowTxHash) {
		throw new Error('Escrow transaction hash is required to publish a verified review');
	}

	return {
		reviewerPubkey,
		revieweePubkey: expectedRevieweePubkey,
		escrowTxHash: resolvedEscrowTxHash
	};
}

function toSdkCategoryRatings(
	content: ReviewContentWithRatings
): VerifiedReview['content']['categoryRatings'] {
	if ('workQuality' in content.categoryRatings) {
		return {
			quality: content.categoryRatings.workQuality,
			professionalism: content.categoryRatings.experience,
			timeliness: content.categoryRatings.deliverySpeed
		};
	}

	if ('communication' in content.categoryRatings) {
		return {
			quality: content.categoryRatings.communication,
			professionalism: content.categoryRatings.clarity,
			timeliness: content.categoryRatings.paymentTimeliness
		};
	}

	return content.categoryRatings;
}

function toSdkVerifiedReview(review: NostrVerifiedReview): VerifiedReview {
	return {
		commitment: review.commitment,
		merkleProof: review.merkleProof,
		reviewerPubkey: review.reviewerPubkey,
		revieweePubkey: review.revieweePubkey,
		content: {
			overallRating: review.content.overallRating,
			categoryRatings: toSdkCategoryRatings(review.content),
			comment: review.content.comment || '',
			photos: review.content.photos || []
		},
		createdAt: review.createdAt,
		eventId: review.eventId
	};
}

function getReviewTimestamp(review: NostrVerifiedReview): number {
	return review.createdAt;
}

function selectLatestReview(
	existing: NostrVerifiedReview | undefined,
	candidate: NostrVerifiedReview
): NostrVerifiedReview {
	if (!existing) {
		return candidate;
	}

	if (getReviewTimestamp(candidate) !== getReviewTimestamp(existing)) {
		return getReviewTimestamp(candidate) > getReviewTimestamp(existing) ? candidate : existing;
	}

	return candidate.nostrEventId > existing.nostrEventId ? candidate : existing;
}

function upsertLatestReview(
	reviewsByCommitment: Map<string, NostrVerifiedReview>,
	candidate: NostrVerifiedReview
): void {
	reviewsByCommitment.set(
		toReviewMapKey(candidate),
		selectLatestReview(reviewsByCommitment.get(toReviewMapKey(candidate)), candidate)
	);
}

function getSortedReviews(
	reviewsByCommitment: Map<string, NostrVerifiedReview>,
	limit: number
): NostrVerifiedReview[] {
	return [...reviewsByCommitment.values()]
		.sort((a, b) => {
			if (a.createdAt !== b.createdAt) {
				return b.createdAt - a.createdAt;
			}

			return b.nostrEventId.localeCompare(a.nostrEventId);
		})
		.slice(0, limit);
}

/**
 * Parse a review event and extract role-specific categories if available
 */
function parseReviewEvent(event: NostrEvent, relayUrl: string): NostrVerifiedReview | null {
	try {
		const reviewData = JSON.parse(event.content) as ExtendedVerifiedReview;
		const signedReviewerPubkey = event.pubkey;
		const taggedRevieweePubkey = getTagValue(event, 'p');

		if (
			reviewData.reviewerPubkey &&
			!pubkeysMatch(reviewData.reviewerPubkey, signedReviewerPubkey)
		) {
			console.warn('Ignoring review event with mismatched reviewer identity', {
				eventId: event.id
			});
			return null;
		}

		if (
			taggedRevieweePubkey &&
			reviewData.revieweePubkey &&
			!pubkeysMatch(reviewData.revieweePubkey, taggedRevieweePubkey)
		) {
			console.warn('Ignoring review event with mismatched reviewee identity', {
				eventId: event.id
			});
			return null;
		}

		// If fullContent exists, use it; otherwise use the SDK format
		let content: ReviewContentWithRatings;

		if (reviewData.fullContent) {
			// Use role-specific categories from fullContent
			content = reviewData.fullContent;
		} else {
			// Legacy format: convert SDK format to ReviewContentWithRatings
			// Try to determine role from tags
			const roleTag = event.tags.find((t) => t[0] === 'role');
			const revieweeRole = roleTag ? (roleTag[1] as RevieweeRole) : undefined;

			// Convert SDK format to role-specific if we know the role
			if (revieweeRole === 'taskee') {
				content = {
					overallRating: reviewData.content.overallRating,
					categoryRatings: {
						workQuality: reviewData.content.categoryRatings.quality,
						experience: reviewData.content.categoryRatings.professionalism,
						deliverySpeed: reviewData.content.categoryRatings.timeliness
					} as TaskeeCategoryRatings,
					revieweeRole: 'taskee',
					comment: reviewData.content.comment,
					photos: reviewData.content.photos
				};
			} else if (revieweeRole === 'tasker') {
				content = {
					overallRating: reviewData.content.overallRating,
					categoryRatings: {
						communication: reviewData.content.categoryRatings.quality,
						clarity: reviewData.content.categoryRatings.professionalism,
						paymentTimeliness: reviewData.content.categoryRatings.timeliness
					} as TaskerCategoryRatings,
					revieweeRole: 'tasker',
					comment: reviewData.content.comment,
					photos: reviewData.content.photos
				};
			} else {
				// Unknown role, use legacy format
				content = {
					overallRating: reviewData.content.overallRating,
					categoryRatings: reviewData.content.categoryRatings,
					comment: reviewData.content.comment,
					photos: reviewData.content.photos
				};
			}
		}

		// Create NostrVerifiedReview with role-specific content
		const nostrReview: NostrVerifiedReview = {
			commitment: reviewData.commitment,
			merkleProof: reviewData.merkleProof,
			reviewerPubkey: signedReviewerPubkey,
			revieweePubkey: taggedRevieweePubkey || reviewData.revieweePubkey,
			content: content,
			createdAt: reviewData.createdAt,
			eventId: reviewData.eventId,
			nostrEventId: event.id,
			nostrRelay: relayUrl
		};

		return nostrReview;
	} catch (error) {
		console.error('Failed to parse review event:', error);
		return null;
	}
}

const DEFAULT_RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean);

/**
 * Publish a verified review to Nostr
 */
export async function publishVerifiedReview(
	escrowId: string,
	revieweePubkey: string,
	content: ReviewContentWithRatings,
	escrowTxHash?: string
): Promise<string> {
	try {
		// Get escrow details to verify completion status
		const escrowData = await escrow.getEscrow(escrowId);
		if (!escrowData) {
			throw new Error('Escrow not found');
		}

		// Verify escrow is in a completed state
		const completedStates = [EscrowStatus.Completed, EscrowStatus.DisputeResolved];

		if (!completedStates.includes(escrowData.status)) {
			throw new Error(`Escrow is not in a completed state. Current status: ${escrowData.status}`);
		}

		const authorization = await resolveAuthorizedReviewContext(
			escrowId,
			revieweePubkey,
			escrowTxHash
		);

		// Create commitment
		const commitment = await createEscrowCommitment(
			escrowId,
			authorization.escrowTxHash,
			escrowData.client,
			escrowData.freelancer
		);

		// Get Merkle proof
		// First try to get latest tree
		const latestVersion = await getLatestTreeVersion();
		let treeData = null;
		if (latestVersion) {
			treeData = await retrieveMerkleTree(latestVersion);
		}

		const proofJson = await getCommitmentProof(commitment, treeData || undefined);
		if (!proofJson) {
			throw new Error('Failed to generate Merkle proof. Merkle tree may not be updated yet.');
		}

		const merkleProof = JSON.parse(proofJson);

		// Create verified review with SDK format for verification
		const verifiedReview: VerifiedReview = {
			commitment,
			merkleProof,
			reviewerPubkey: authorization.reviewerPubkey,
			revieweePubkey: authorization.revieweePubkey,
			content: {
				overallRating: content.overallRating,
				categoryRatings: toSdkCategoryRatings(content),
				comment: content.comment || '',
				photos: content.photos || []
			},
			createdAt: Date.now()
		};

		// Store the full ReviewContentWithRatings (including role-specific categories) in the Nostr event
		// This allows us to retrieve role-specific data when reading reviews
		const fullReviewContent: ReviewContentWithRatings = {
			overallRating: content.overallRating,
			categoryRatings: content.categoryRatings, // Keep original role-specific categories
			revieweeRole: content.revieweeRole,
			comment: content.comment,
			photos: content.photos
		};

		// Verify the review before publishing
		const verification = await verifyReview(verifiedReview, merkleProof.root);
		if (!verification.valid) {
			throw new Error(`Review verification failed: ${verification.error}`);
		}

		// Create Nostr event with extended review data
		// Store both SDK format (for verification) and full role-specific data
		const extendedReview = {
			...verifiedReview,
			fullContent: fullReviewContent // Store role-specific categories separately
		};

		const event: Partial<NostrEvent> = {
			kind: KINDS.REVIEW_VERIFIED,
			created_at: Math.floor(Date.now() / 1000),
			content: JSON.stringify(extendedReview),
			tags: [
				['e', escrowId], // Escrow ID reference
				['p', authorization.revieweePubkey], // Reviewee pubkey
				['commitment', commitment], // Commitment hash
				['root', merkleProof.root], // Merkle root
				['version', latestVersion || ''], // Tree version
				...(content.revieweeRole ? [['role', content.revieweeRole]] : []) // Store role in tags for easy filtering
			]
		};

		const publishedEvent = await publishEvent(event);

		return publishedEvent.id;
	} catch (error) {
		console.error('Failed to publish verified review:', error);
		throw error;
	}
}

/**
 * Update an existing review
 */
export async function updateVerifiedReview(
	originalEventId: string,
	escrowId: string,
	revieweePubkey: string,
	content: ReviewContentWithRatings,
	escrowTxHash?: string
): Promise<string> {
	// Check if review exists
	const existingReview = await getReviewByEventId(originalEventId);
	if (!existingReview) {
		throw new Error('Original review not found');
	}

	// Verify it's the same escrow
	const escrowData = await escrow.getEscrow(escrowId);
	if (!escrowData) {
		throw new Error('Escrow not found');
	}

	const authorization = await resolveAuthorizedReviewContext(
		escrowId,
		revieweePubkey,
		escrowTxHash
	);

	if (
		existingReview.commitment !==
		(await createEscrowCommitment(
			escrowId,
			authorization.escrowTxHash,
			escrowData.client,
			escrowData.freelancer
		))
	) {
		throw new Error('Cannot update review for different escrow');
	}

	// Publish new review (replaces old one)
	return await publishVerifiedReview(
		escrowId,
		authorization.revieweePubkey,
		content,
		authorization.escrowTxHash
	);
}

function collectReviews(
	filter: Filter,
	limit: number,
	timeoutMs: number = 10000
): Promise<NostrVerifiedReview[]> {
	return new Promise((resolve) => {
		const reviewsByCommitment = new Map<string, NostrVerifiedReview>();
		const relayUrl = DEFAULT_RELAYS[0] || '';
		if (!relayUrl) {
			resolve([]);
			return;
		}

		let settled = false;
		let unsubscribe: (() => void) | undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		const finalize = () => {
			if (settled) {
				return;
			}

			settled = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
			const closeSubscription = unsubscribe;
			unsubscribe = undefined;
			closeSubscription?.();
			resolve(getSortedReviews(reviewsByCommitment, limit));
		};
		timeoutId = setTimeout(finalize, timeoutMs);

		unsubscribe = subscribeToEvents(
			relayUrl,
			[filter],
			(event: NostrEvent) => {
				const nostrReview = parseReviewEvent(event, relayUrl);
				if (!nostrReview) return;
				upsertLatestReview(reviewsByCommitment, nostrReview);
			},
			finalize
		);

		if (settled) {
			const closeSubscription = unsubscribe;
			unsubscribe = undefined;
			closeSubscription?.();
		}
	});
}

/**
 * Get reviews by a reviewer (where user is the reviewer)
 */
export async function getReviewsByReviewer(
	reviewerPubkey: string,
	limit: number = 50
): Promise<NostrVerifiedReview[]> {
	const filter: Filter = {
		kinds: [KINDS.REVIEW_VERIFIED],
		authors: [normalizePubkey(reviewerPubkey) ?? reviewerPubkey],
		limit
	};

	return collectReviews(filter, limit);
}

/**
 * Get reviews for a user (reviewee)
 */
export async function getReviewsForUser(
	revieweePubkey: string,
	limit: number = 50
): Promise<NostrVerifiedReview[]> {
	const filter: Filter = {
		kinds: [KINDS.REVIEW_VERIFIED],
		'#p': [normalizePubkey(revieweePubkey) ?? revieweePubkey],
		limit
	};

	return collectReviews(filter, limit);
}

/**
 * Get review by Nostr event ID
 */
export async function getReviewByEventId(eventId: string): Promise<NostrVerifiedReview | null> {
	return new Promise((resolve) => {
		const filter: Filter = {
			ids: [eventId],
			kinds: [KINDS.REVIEW_VERIFIED]
		};

		const relayUrl = DEFAULT_RELAYS[0] || '';
		if (!relayUrl) {
			resolve(null);
			return;
		}

		let settled = false;
		let found = false;
		let unsubscribe: (() => void) | undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		const finalize = (review: NostrVerifiedReview | null) => {
			if (settled) {
				return;
			}

			settled = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
			const closeSubscription = unsubscribe;
			unsubscribe = undefined;
			closeSubscription?.();
			resolve(review);
		};
		timeoutId = setTimeout(() => finalize(null), 5000);
		unsubscribe = subscribeToEvents(
			relayUrl,
			[filter],
			(event: NostrEvent) => {
				if (!found) {
					found = true;
					finalize(parseReviewEvent(event, relayUrl));
				}
			},
			() => finalize(null)
		);

		if (settled) {
			const closeSubscription = unsubscribe;
			unsubscribe = undefined;
			closeSubscription?.();
		}
	});
}

/**
 * Get reviews for an escrow
 */
export async function getReviewsForEscrow(escrowId: string): Promise<NostrVerifiedReview[]> {
	const filter: Filter = {
		kinds: [KINDS.REVIEW_VERIFIED],
		'#e': [escrowId],
		limit: 10 // Maximum one review per escrow (with updates)
	};

	return collectReviews(filter, 10);
}

/**
 * Verify a review retrieved from Nostr
 */
export async function verifyNostrReview(review: NostrVerifiedReview): Promise<boolean> {
	const verification = await verifyReview(toSdkVerifiedReview(review), review.merkleProof.root);
	return verification.valid;
}

/**
 * Check if user has already reviewed an escrow
 */
export async function hasUserReviewedEscrow(
	escrowId: string,
	reviewerPubkey: string
): Promise<boolean> {
	const reviews = await getReviewsForEscrow(escrowId);
	return reviews.some((review) => pubkeysMatch(review.reviewerPubkey, reviewerPubkey));
}
