import { describe, expect, it } from 'vitest';
import { calculateReviewStats, filterReviews, sortReviews } from '../review-aggregation';
import type { NostrVerifiedReview } from '$lib/types/review';

function createReview(
	id: string,
	overrides: Partial<NostrVerifiedReview> = {}
): NostrVerifiedReview {
	return {
		commitment: `commitment-${id}`,
		merkleProof: {
			root: '0x' + 'a'.repeat(64),
			leaf: 'leaf',
			proof: [],
			proofFlags: []
		},
		reviewerPubkey: 'npub-reviewer',
		revieweePubkey: 'npub-reviewee',
		content: {
			overallRating: 5,
			categoryRatings: {
				quality: 5,
				professionalism: 5,
				timeliness: 5
			}
		},
		createdAt: 1_700_000_000_000,
		nostrEventId: id,
		...overrides
	};
}

describe('review-aggregation', () => {
	it('filters reviews when date boundaries are set to zero', () => {
		const reviews = [
			createReview('review-1', { createdAt: 0 }),
			createReview('review-2', { createdAt: 1 })
		];

		expect(filterReviews(reviews, { dateFrom: 0 })).toHaveLength(2);
		expect(filterReviews(reviews, { dateTo: 0 })).toEqual([
			expect.objectContaining({ nostrEventId: 'review-1' })
		]);
	});

	it('ignores invalid ratings instead of producing out-of-range aggregates', () => {
		const validReview = createReview('valid-review', {
			content: {
				overallRating: 4,
				categoryRatings: {
					quality: 4,
					professionalism: 4,
					timeliness: 4
				}
			}
		});
		const invalidReview = createReview('invalid-review', {
			content: {
				overallRating: 8,
				categoryRatings: {
					quality: -1,
					professionalism: 9,
					timeliness: 4
				}
			}
		});

		const stats = calculateReviewStats([validReview, invalidReview]);

		expect(stats.totalReviews).toBe(1);
		expect(stats.averageRating).toBe(4);
		expect(stats.ratingDistribution).toEqual({
			1: 0,
			2: 0,
			3: 0,
			4: 1,
			5: 0
		});
	});

	it('does not let malformed category payloads dilute category averages', () => {
		const validReview = createReview('valid-review', {
			content: {
				overallRating: 4,
				categoryRatings: {
					quality: 4,
					professionalism: 5,
					timeliness: 3
				}
			}
		});
		const malformedCategoriesReview = createReview('malformed-categories', {
			content: {
				overallRating: 5,
				categoryRatings: {
					quality: 0,
					professionalism: 7,
					timeliness: 'bad'
				} as unknown as NostrVerifiedReview['content']['categoryRatings']
			}
		});

		const stats = calculateReviewStats([validReview, malformedCategoriesReview]);

		expect(stats.totalReviews).toBe(2);
		expect(stats.averageRating).toBe(4.5);
		expect(stats.averageQuality).toBe(4);
		expect(stats.averageProfessionalism).toBe(5);
		expect(stats.averageTimeliness).toBe(3);
	});

	it('treats malformed comment and photo payloads as absent instead of throwing during filtering', () => {
		const malformedCommentReview = createReview('malformed-comment', {
			content: {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 5,
					timeliness: 5
				},
				comment: 123 as unknown as string
			}
		});
		const malformedPhotosReview = createReview('malformed-photos', {
			content: {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 5,
					timeliness: 5
				},
				photos: 'not-an-array' as unknown as string[]
			}
		});

		expect(() => filterReviews([malformedCommentReview], { hasComment: true })).not.toThrow();
		expect(filterReviews([malformedCommentReview], { hasComment: true })).toEqual([]);
		expect(() => filterReviews([malformedPhotosReview], { hasPhotos: true })).not.toThrow();
		expect(filterReviews([malformedPhotosReview], { hasPhotos: true })).toEqual([]);
	});

	it('sorts malformed review payloads deterministically without throwing', () => {
		const newestInvalidRating = createReview('invalid-newest', {
			content: {
				overallRating: 'bad' as unknown as number,
				categoryRatings: {
					quality: 5,
					professionalism: 5,
					timeliness: 5
				}
			},
			createdAt: 300
		});
		const lowerValidRating = createReview('valid-lower', {
			content: {
				overallRating: 3,
				categoryRatings: {
					quality: 3,
					professionalism: 3,
					timeliness: 3
				}
			},
			createdAt: 100
		});
		const higherValidRating = createReview('valid-higher', {
			content: {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 5,
					timeliness: 5
				}
			},
			createdAt: 200
		});

		expect(() =>
			sortReviews([newestInvalidRating, lowerValidRating, higherValidRating], 'highest_rating')
		).not.toThrow();
		expect(
			sortReviews([newestInvalidRating, lowerValidRating, higherValidRating], 'highest_rating').map(
				(review) => review.nostrEventId
			)
		).toEqual(['valid-higher', 'valid-lower', 'invalid-newest']);
		expect(
			sortReviews([newestInvalidRating, lowerValidRating, higherValidRating], 'lowest_rating').map(
				(review) => review.nostrEventId
			)
		).toEqual(['valid-lower', 'valid-higher', 'invalid-newest']);
	});
});
