/**
 * Nostr Review Utilities
 * 
 * Functions for publishing and retrieving verified reviews via Nostr
 */

import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { getSignedEvent, publishEvent, subscribeToEvents } from './nostr';
import KINDS from './constants/kinds';
import { 
	createEscrowCommitment, 
	getCommitmentProof, 
	verifyReview,
	getLatestTreeVersion,
	retrieveMerkleTree
} from '$lib/services/review-verification.service';
import type { NostrVerifiedReview, ReviewContentWithRatings, TaskeeCategoryRatings, TaskerCategoryRatings } from '$lib/types/review';

/**
 * Extended review format stored in Nostr events
 * Includes both SDK format (for verification) and role-specific categories
 */
interface ExtendedVerifiedReview extends VerifiedReview {
	fullContent?: ReviewContentWithRatings;
}

/**
 * Parse a review event and extract role-specific categories if available
 */
function parseReviewEvent(event: NostrEvent, relayUrl: string): NostrVerifiedReview | null {
	try {
		const reviewData = JSON.parse(event.content) as ExtendedVerifiedReview;
		
		// If fullContent exists, use it; otherwise use the SDK format
		let content: ReviewContentWithRatings;
		
		if (reviewData.fullContent) {
			// Use role-specific categories from fullContent
			content = reviewData.fullContent;
		} else {
			// Legacy format: convert SDK format to ReviewContentWithRatings
			// Try to determine role from tags
			const roleTag = event.tags.find(t => t[0] === 'role');
			const revieweeRole = roleTag ? (roleTag[1] as 'tasker' | 'taskee') : undefined;
			
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
			reviewerPubkey: reviewData.reviewerPubkey,
			revieweePubkey: reviewData.revieweePubkey,
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
import type { VerifiedReview } from '@bittasker/merkle-review-sdk';
import { escrow } from '$lib/utils/wallet/escrow';
import { EscrowStatus } from '$lib/utils/enums/escrow.enum';

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
		const completedStates = [
			EscrowStatus.Completed,
			EscrowStatus.DisputeResolved
		];
		
		if (!completedStates.includes(escrowData.status)) {
			throw new Error(`Escrow is not in a completed state. Current status: ${escrowData.status}`);
		}

		// Get transaction hash if not provided
		const txHash = escrowTxHash || escrowData.id; // Use escrow ID as fallback
		
		// Create commitment
		const commitment = await createEscrowCommitment(
			escrowId,
			txHash,
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

		// Get reviewer pubkey
		const { getNpub } = await import('$lib/utils/nostrKeys');
		const reviewerPubkey = await getNpub();
		if (!reviewerPubkey) {
			throw new Error('Failed to get reviewer pubkey');
		}

		// Map role-specific categories to SDK format for verification
		// The SDK requires: quality, professionalism, timeliness
		let sdkCategoryRatings: { quality: number; professionalism: number; timeliness: number };
		
		if ('workQuality' in content.categoryRatings) {
			// Taskee categories: map to SDK format
			const taskeeRatings = content.categoryRatings as { workQuality: number; experience: number; deliverySpeed: number };
			sdkCategoryRatings = {
				quality: taskeeRatings.workQuality,
				professionalism: taskeeRatings.experience,
				timeliness: taskeeRatings.deliverySpeed
			};
		} else if ('communication' in content.categoryRatings) {
			// Tasker categories: map to SDK format
			const taskerRatings = content.categoryRatings as { communication: number; clarity: number; paymentTimeliness: number };
			sdkCategoryRatings = {
				quality: taskerRatings.communication,
				professionalism: taskerRatings.clarity,
				timeliness: taskerRatings.paymentTimeliness
			};
		} else {
			// Legacy format (already in SDK format)
			sdkCategoryRatings = content.categoryRatings as { quality: number; professionalism: number; timeliness: number };
		}

		// Create verified review with SDK format for verification
		const verifiedReview: VerifiedReview = {
			commitment,
			merkleProof,
			reviewerPubkey,
			revieweePubkey,
			content: {
				overallRating: content.overallRating,
				categoryRatings: sdkCategoryRatings,
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
				['p', revieweePubkey], // Reviewee pubkey
				['commitment', commitment], // Commitment hash
				['root', merkleProof.root], // Merkle root
				['version', latestVersion || ''], // Tree version
				...(content.revieweeRole ? [['role', content.revieweeRole]] : []) // Store role in tags for easy filtering
			]
		};

		// Sign and publish
		const signedEvent = await getSignedEvent(event);
		await publishEvent(signedEvent);

		return signedEvent.id;
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
	if (existingReview.commitment !== await createEscrowCommitment(
		escrowId,
		escrowTxHash || escrowId,
		(await escrow.getEscrow(escrowId))?.client || '',
		(await escrow.getEscrow(escrowId))?.freelancer || ''
	)) {
		throw new Error('Cannot update review for different escrow');
	}

	// Publish new review (replaces old one)
	return await publishVerifiedReview(escrowId, revieweePubkey, content, escrowTxHash);
}

/**
 * Get reviews by a reviewer (where user is the reviewer)
 */
export async function getReviewsByReviewer(
	reviewerPubkey: string,
	limit: number = 50
): Promise<NostrVerifiedReview[]> {
	return new Promise((resolve) => {
		const reviews: NostrVerifiedReview[] = [];
		const seenCommitments = new Set<string>();

		const filter: Filter = {
			kinds: [KINDS.REVIEW_VERIFIED],
			authors: [reviewerPubkey],
			limit
		};

		const relayUrl = DEFAULT_RELAYS[0] || '';
		if (!relayUrl) {
			resolve([]);
			return;
		}

		const unsubscribe = subscribeToEvents(
			relayUrl,
			[filter],
			(event: NostrEvent) => {
				const nostrReview = parseReviewEvent(event, relayUrl);
				if (!nostrReview) return;
				
				// Deduplicate by commitment
				if (seenCommitments.has(nostrReview.commitment)) {
					return;
				}
				seenCommitments.add(nostrReview.commitment);

				reviews.push(nostrReview);

				if (reviews.length >= limit) {
					unsubscribe();
					resolve(reviews);
				}
			}
		);

		// Timeout after 10 seconds
		setTimeout(() => {
			unsubscribe();
			resolve(reviews);
		}, 10000);
	});
}

/**
 * Get reviews for a user (reviewee)
 */
export async function getReviewsForUser(
	revieweePubkey: string,
	limit: number = 50
): Promise<NostrVerifiedReview[]> {
	return new Promise((resolve) => {
		const reviews: NostrVerifiedReview[] = [];
		const seenCommitments = new Set<string>();

		const filter: Filter = {
			kinds: [KINDS.REVIEW_VERIFIED],
			'#p': [revieweePubkey],
			limit
		};

		const relayUrl = DEFAULT_RELAYS[0] || '';
		if (!relayUrl) {
			resolve([]);
			return;
		}

		const unsubscribe = subscribeToEvents(
			relayUrl,
			[filter],
			(event: NostrEvent) => {
				const nostrReview = parseReviewEvent(event, relayUrl);
				if (!nostrReview) return;
				
				// Deduplicate by commitment
				if (seenCommitments.has(nostrReview.commitment)) {
					return;
				}
				seenCommitments.add(nostrReview.commitment);

				reviews.push(nostrReview);

				if (reviews.length >= limit) {
					unsubscribe();
					resolve(reviews);
				}
			}
		);

		// Timeout after 10 seconds
		setTimeout(() => {
			unsubscribe();
			resolve(reviews);
		}, 10000);
	});
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

		let found = false;
		const unsubscribe = subscribeToEvents(
			relayUrl,
			[filter],
			(event: NostrEvent) => {
				if (!found) {
					found = true;
					const nostrReview = parseReviewEvent(event, relayUrl);
					unsubscribe();
					resolve(nostrReview);
				}
			}
		);

		// Timeout after 5 seconds
		setTimeout(() => {
			if (!found) {
				unsubscribe();
				resolve(null);
			}
		}, 5000);
	});
}

/**
 * Get reviews for an escrow
 */
export async function getReviewsForEscrow(escrowId: string): Promise<NostrVerifiedReview[]> {
	return new Promise((resolve) => {
		const reviews: NostrVerifiedReview[] = [];
		const seenCommitments = new Set<string>();

		const filter: Filter = {
			kinds: [KINDS.REVIEW_VERIFIED],
			'#e': [escrowId],
			limit: 10 // Maximum one review per escrow (with updates)
		};

		const relayUrl = DEFAULT_RELAYS[0] || '';
		if (!relayUrl) {
			resolve([]);
			return;
		}

		const unsubscribe = subscribeToEvents(
			relayUrl,
			[filter],
			(event: NostrEvent) => {
				try {
					const reviewData = JSON.parse(event.content) as VerifiedReview;
					
					// Deduplicate by commitment
					if (seenCommitments.has(reviewData.commitment)) {
						return;
					}
					seenCommitments.add(reviewData.commitment);

					const nostrReview: NostrVerifiedReview = {
						...reviewData,
						nostrEventId: event.id,
						nostrRelay: relayUrl
					};

					reviews.push(nostrReview);
				} catch (error) {
					console.error('Failed to parse review event:', error);
				}
			}
		);

		// Timeout after 10 seconds
		setTimeout(() => {
			unsubscribe();
			resolve(reviews);
		}, 10000);
	});
}

/**
 * Verify a review retrieved from Nostr
 */
export async function verifyNostrReview(review: NostrVerifiedReview): Promise<boolean> {
	const verification = await verifyReview(review, review.merkleProof.root);
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
	return reviews.some(review => review.reviewerPubkey === reviewerPubkey);
}

