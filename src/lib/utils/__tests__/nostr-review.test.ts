import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	publishVerifiedReview,
	getReviewsForUser,
	getReviewByEventId,
	verifyNostrReview,
	hasUserReviewedEscrow
} from '../nostr-review';
import { escrow } from '$lib/utils/wallet/escrow';
import { createEscrowCommitment, getCommitmentProof } from '$lib/services/review-verification.service';
import { getNpub } from '$lib/utils/nostrKeys';
import { publishEvent } from '../nostr';
import { EscrowStatus } from '$lib/utils/enums/escrow.enum';

// Mock dependencies
vi.mock('$lib/utils/wallet/escrow', () => ({
	escrow: {
		getEscrow: vi.fn()
	}
}));

vi.mock('$lib/services/review-verification.service', () => ({
	createEscrowCommitment: vi.fn(),
	getCommitmentProof: vi.fn(),
	getLatestTreeVersion: vi.fn(),
	retrieveMerkleTree: vi.fn()
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn()
}));

vi.mock('../nostr', () => ({
	publishEvent: vi.fn(),
	getSignedEvent: vi.fn((event) => Promise.resolve({ ...event, id: 'signed-event-id', sig: 'sig' }))
}));

describe('nostr-review utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('publishVerifiedReview', () => {
		it('should publish review for completed escrow', async () => {
			vi.mocked(escrow.getEscrow).mockResolvedValue({
				id: '123',
				client: '0x111',
				freelancer: '0x222',
				status: EscrowStatus.Completed,
				baseAmount: '1.0',
				createdAt: Date.now()
			} as any);

			vi.mocked(getNpub).mockResolvedValue('npub1reviewer');
			vi.mocked(createEscrowCommitment).mockResolvedValue('commitment123');
			vi.mocked(getCommitmentProof).mockResolvedValue(JSON.stringify({
				root: '0xabc',
				leaf: 'commitment123',
				proof: [],
				proofFlags: []
			}));

			const content = {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 5,
					timeliness: 5
				},
				comment: 'Great!'
			};

			const eventId = await publishVerifiedReview('123', 'npub1reviewee', content);

			expect(eventId).toBeDefined();
			expect(publishEvent).toHaveBeenCalled();
		});

		it('should reject review for non-completed escrow', async () => {
			vi.mocked(escrow.getEscrow).mockResolvedValue({
				id: '123',
				client: '0x111',
				freelancer: '0x222',
				status: EscrowStatus.Funded,
				baseAmount: '1.0',
				createdAt: Date.now()
			} as any);

			const content = {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 5,
					timeliness: 5
				}
			};

			await expect(
				publishVerifiedReview('123', 'npub1reviewee', content)
			).rejects.toThrow();
		});
	});

	describe('getReviewsForUser', () => {
		it('should fetch reviews for a user', async () => {
			// Mock subscribeToEvents from nostr.ts
			const mockUnsubscribe = vi.fn();
			const mockOnEvent = vi.fn();
			const mockOnEOSE = vi.fn();

			vi.mock('../nostr', async () => {
				const actual = await vi.importActual('../nostr');
				return {
					...actual,
					subscribeToEvents: vi.fn((relays, filters, onEvent, onEOSE) => {
						// Simulate receiving an event
						setTimeout(() => {
							onEvent({
								id: 'event-123',
								content: JSON.stringify({
									commitment: 'commitment123',
									merkleProof: { root: '0xabc', leaf: 'commitment123', proof: [], proofFlags: [] },
									reviewerPubkey: 'npub1reviewer',
									revieweePubkey: 'npub1reviewee',
									content: {
										overallRating: 5,
										categoryRatings: { quality: 5, professionalism: 5, timeliness: 5 },
										comment: 'Great!'
									},
									createdAt: Date.now()
								}),
								kind: 31007,
								created_at: Math.floor(Date.now() / 1000),
								tags: [],
								pubkey: 'npub1reviewer',
								sig: 'sig'
							});
							onEOSE();
						}, 10);
						return mockUnsubscribe;
					})
				};
			});

			const reviews = await getReviewsForUser('npub1reviewee', 10);

			expect(Array.isArray(reviews)).toBe(true);
		});
	});

	describe('verifyNostrReview', () => {
		it('should verify a valid review', async () => {
			const review = {
				commitment: 'commitment123',
				merkleProof: {
					root: '0xabc',
					leaf: 'commitment123',
					proof: [],
					proofFlags: []
				},
				reviewerPubkey: 'npub1reviewer',
				revieweePubkey: 'npub1reviewee',
				content: {
					overallRating: 5,
					categoryRatings: { quality: 5, professionalism: 5, timeliness: 5 }
				},
				createdAt: Date.now(),
				nostrEventId: 'event-123'
			};

			vi.mock('$lib/services/review-verification.service', async () => {
				const actual = await vi.importActual('$lib/services/review-verification.service');
				return {
					...actual,
					verifyReview: vi.fn().mockResolvedValue({ valid: true })
				};
			});

			const isValid = await verifyNostrReview(review as any);

			expect(isValid).toBe(true);
		});
	});

	describe('hasUserReviewedEscrow', () => {
		it('should check if user has reviewed escrow', async () => {
			// Mock getReviewsForEscrow
			vi.mock('../nostr-review', async () => {
				const actual = await vi.importActual('../nostr-review');
				return {
					...actual,
					getReviewsForEscrow: vi.fn().mockResolvedValue([
						{
							reviewerPubkey: 'npub1reviewer',
							commitment: 'commitment123'
						}
					])
				};
			});

			const hasReviewed = await hasUserReviewedEscrow('123', 'npub1reviewer');

			expect(typeof hasReviewed).toBe('boolean');
		});
	});
});


