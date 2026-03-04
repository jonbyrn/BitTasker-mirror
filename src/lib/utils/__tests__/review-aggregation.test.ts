import { describe, it, expect } from 'vitest';
import { calculateReviewStats, filterReviews, sortReviews, getRatingPercentage } from '../review-aggregation';
import type { NostrVerifiedReview, ReviewStats } from '$lib/types/review';

function makeReview(opts: { overallRating?: number; createdAt?: number; nostrEventId?: string; revieweeRole?: 'tasker' | 'taskee'; categoryRatings?: Record<string, number> }): NostrVerifiedReview {
	const overallRating = opts.overallRating ?? 4;
	const categoryRatings = opts.categoryRatings ?? { quality: 4, professionalism: 4, timeliness: 4 };
	return {
		reviewerPubkey: 'pk1',
		revieweePubkey: 'pk2',
		content: { overallRating, categoryRatings, revieweeRole: opts.revieweeRole },
		createdAt: opts.createdAt ?? Date.now(),
		nostrEventId: opts.nostrEventId ?? 'e1'
	};
}

describe('review-aggregation', () => {
	describe('calculateReviewStats', () => {
		it('returns zero stats for empty array', () => {
			const stats = calculateReviewStats([]);
			expect(stats.totalReviews).toBe(0);
			expect(stats.averageRating).toBe(0);
			expect(stats.ratingDistribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
		});

		it('rounds averageRating to one decimal', () => {
			const reviews = [
				makeReview({ overallRating: 3.33, nostrEventId: 'a' }),
				makeReview({ overallRating: 3.33, nostrEventId: 'b' }),
				makeReview({ overallRating: 3.34, nostrEventId: 'c' })
			];
			const stats = calculateReviewStats(reviews);
			expect(stats.averageRating).toBe(3.3);
		});

		it('computes rating distribution', () => {
			const reviews = [
				makeReview({ overallRating: 5, nostrEventId: 'a' }),
				makeReview({ overallRating: 4, nostrEventId: 'b' }),
				makeReview({ overallRating: 4, nostrEventId: 'c' })
			];
			const stats = calculateReviewStats(reviews);
			expect(stats.ratingDistribution[5]).toBe(1);
			expect(stats.ratingDistribution[4]).toBe(2);
		});

		it('handles taskee categories and rounds', () => {
			const reviews = [
				makeReview({ overallRating: 4, revieweeRole: 'taskee', categoryRatings: { workQuality: 4, experience: 5, deliverySpeed: 4 }, nostrEventId: 't1' }),
				makeReview({ overallRating: 5, revieweeRole: 'taskee', categoryRatings: { workQuality: 5, experience: 5, deliverySpeed: 5 }, nostrEventId: 't2' })
			];
			const stats = calculateReviewStats(reviews);
			expect(stats.taskeeReviewCount).toBe(2);
			expect(stats.averageWorkQuality).toBe(4.5);
		});
	});

	describe('filterReviews', () => {
		it('filters by minRating and maxRating', () => {
			const reviews = [
				makeReview({ overallRating: 2, nostrEventId: 'a' }),
				makeReview({ overallRating: 4, nostrEventId: 'b' }),
				makeReview({ overallRating: 5, nostrEventId: 'c' })
			];
			expect(filterReviews(reviews, { minRating: 4 })).toHaveLength(2);
			expect(filterReviews(reviews, { maxRating: 3 })).toHaveLength(1);
		});
	});

	describe('sortReviews', () => {
		it('sorts by newest and oldest', () => {
			const reviews = [
				makeReview({ createdAt: 1000, nostrEventId: 'old' }),
				makeReview({ createdAt: 3000, nostrEventId: 'new' })
			];
			expect(sortReviews(reviews, 'newest')[0].nostrEventId).toBe('new');
			expect(sortReviews(reviews, 'oldest')[0].nostrEventId).toBe('old');
		});
	});

	describe('getRatingPercentage', () => {
		it('returns 0 when totalReviews is 0', () => {
			const stats: ReviewStats = { totalReviews: 0, averageRating: 0, averageQuality: 0, averageProfessionalism: 0, averageTimeliness: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
			expect(getRatingPercentage(stats, 5)).toBe(0);
		});
		it('returns correct percentage', () => {
			const stats: ReviewStats = { totalReviews: 10, averageRating: 4, averageQuality: 4, averageProfessionalism: 4, averageTimeliness: 4, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 6, 5: 4 } };
			expect(getRatingPercentage(stats, 5)).toBe(40);
		});
	});
});
