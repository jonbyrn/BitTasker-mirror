/**
 * Review Aggregation Utilities
 * 
 * Functions for calculating review statistics and aggregations
 */

import type { NostrVerifiedReview, ReviewStats } from '$lib/types/review';

/**
 * Calculate review statistics from a list of reviews
 */
export function calculateReviewStats(reviews: NostrVerifiedReview[]): ReviewStats {
	if (reviews.length === 0) {
		return {
			totalReviews: 0,
			averageRating: 0,
			averageQuality: 0,
			averageProfessionalism: 0,
			averageTimeliness: 0,
			ratingDistribution: {
				1: 0,
				2: 0,
				3: 0,
				4: 0,
				5: 0
			}
		};
	}

	const totalReviews = reviews.length;
	let totalOverall = 0;
	let totalQuality = 0;
	let totalProfessionalism = 0;
	let totalTimeliness = 0;
	const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

	for (const review of reviews) {
		const overall = review.content.overallRating;
		totalOverall += overall;
		totalQuality += review.content.categoryRatings.quality;
		totalProfessionalism += review.content.categoryRatings.professionalism;
		totalTimeliness += review.content.categoryRatings.timeliness;

		// Round to nearest integer for distribution
		const roundedRating = Math.round(overall);
		if (roundedRating >= 1 && roundedRating <= 5) {
			ratingDistribution[roundedRating as keyof typeof ratingDistribution]++;
		}
	}

	return {
		totalReviews,
		averageRating: totalOverall / totalReviews,
		averageQuality: totalQuality / totalReviews,
		averageProfessionalism: totalProfessionalism / totalReviews,
		averageTimeliness: totalTimeliness / totalReviews,
		ratingDistribution
	};
}

/**
 * Filter reviews by criteria
 */
export function filterReviews(
	reviews: NostrVerifiedReview[],
	filter: {
		minRating?: number;
		maxRating?: number;
		hasComment?: boolean;
		hasPhotos?: boolean;
		dateFrom?: number;
		dateTo?: number;
	}
): NostrVerifiedReview[] {
	return reviews.filter(review => {
		if (filter.minRating !== undefined && review.content.overallRating < filter.minRating) {
			return false;
		}
		if (filter.maxRating !== undefined && review.content.overallRating > filter.maxRating) {
			return false;
		}
		if (filter.hasComment && (!review.content.comment || review.content.comment.trim().length === 0)) {
			return false;
		}
		if (filter.hasPhotos && (!review.content.photos || review.content.photos.length === 0)) {
			return false;
		}
		if (filter.dateFrom && review.createdAt < filter.dateFrom) {
			return false;
		}
		if (filter.dateTo && review.createdAt > filter.dateTo) {
			return false;
		}
		return true;
	});
}

/**
 * Sort reviews
 */
export function sortReviews(
	reviews: NostrVerifiedReview[],
	sortBy: 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating'
): NostrVerifiedReview[] {
	const sorted = [...reviews];

	switch (sortBy) {
		case 'newest':
			return sorted.sort((a, b) => b.createdAt - a.createdAt);
		case 'oldest':
			return sorted.sort((a, b) => a.createdAt - b.createdAt);
		case 'highest_rating':
			return sorted.sort((a, b) => b.content.overallRating - a.content.overallRating);
		case 'lowest_rating':
			return sorted.sort((a, b) => a.content.overallRating - b.content.overallRating);
		default:
			return sorted;
	}
}

/**
 * Get rating percentage for a specific rating value
 */
export function getRatingPercentage(stats: ReviewStats, rating: 1 | 2 | 3 | 4 | 5): number {
	if (stats.totalReviews === 0) return 0;
	return (stats.ratingDistribution[rating] / stats.totalReviews) * 100;
}


