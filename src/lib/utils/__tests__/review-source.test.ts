import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	getStatsForUser,
	getReviewsForUser,
	getReviewsByReviewer,
	hasUserReviewedEscrow
} from '../review-source';

const mockReviews = [
	{
		reviewerPubkey: 'pk1',
		revieweePubkey: 'pk2',
		content: {
			overallRating: 4,
			categoryRatings: { quality: 4, professionalism: 4, timeliness: 4 }
		},
		createdAt: Date.now(),
		nostrEventId: 'e1'
	}
];

vi.mock('../nostr-review', () => ({
	getReviewsForUser: vi.fn(),
	getReviewsByReviewer: vi.fn(),
	getReviewsForEscrow: vi.fn(),
	hasUserReviewedEscrow: vi.fn()
}));

vi.mock('../review-aggregation', () => ({
	calculateReviewStats: vi.fn((reviews: { content: { overallRating: number } }[]) => {
		if (reviews.length === 0) {
			return {
				totalReviews: 0,
				averageRating: 0,
				averageQuality: 0,
				averageProfessionalism: 0,
				averageTimeliness: 0,
				ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
			};
		}
		const sum = reviews.reduce((s, r) => s + r.content.overallRating, 0);
		const avg = Math.round((sum / reviews.length) * 10) / 10;
		return {
			totalReviews: reviews.length,
			averageRating: avg,
			averageQuality: avg,
			averageProfessionalism: avg,
			averageTimeliness: avg,
			ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
		};
	})
}));

describe('review-source', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const nostr = await import('../nostr-review');
		vi.mocked(nostr.getReviewsForUser).mockResolvedValue(mockReviews as never);
	});

	describe('getStatsForUser', () => {
		it('returns stats from calculateReviewStats with reviews from getReviewsForUser', async () => {
			const stats = await getStatsForUser('npub1reviewee');
			expect(stats.totalReviews).toBe(1);
			expect(stats.averageRating).toBe(4);
		});

		it('calls getReviewsForUser with revieweePubkey and limit 500', async () => {
			const nostr = await import('../nostr-review');
			await getStatsForUser('npub1reviewee');
			expect(nostr.getReviewsForUser).toHaveBeenCalledWith('npub1reviewee', 500);
		});
	});

	describe('getReviewsForUser', () => {
		it('forwards to nostr-review getReviewsForUser', async () => {
			const reviews = await getReviewsForUser('npub1x', 20);
			expect(reviews).toEqual(mockReviews);
		});
	});

	describe('getReviewsByReviewer', () => {
		it('forwards to nostr-review getReviewsByReviewer', async () => {
			const nostr = await import('../nostr-review');
			vi.mocked(nostr.getReviewsByReviewer).mockResolvedValue([] as never);
			const reviews = await getReviewsByReviewer('npub1reviewer', 30);
			expect(nostr.getReviewsByReviewer).toHaveBeenCalledWith('npub1reviewer', 30);
			expect(reviews).toEqual([]);
		});
	});

	describe('hasUserReviewedEscrow', () => {
		it('forwards to nostr-review hasUserReviewedEscrow', async () => {
			const nostr = await import('../nostr-review');
			vi.mocked(nostr.hasUserReviewedEscrow).mockResolvedValue(true);
			const result = await hasUserReviewedEscrow('escrow-1', 'npub1reviewer');
			expect(nostr.hasUserReviewedEscrow).toHaveBeenCalledWith('escrow-1', 'npub1reviewer');
			expect(result).toBe(true);
		});
	});
});
