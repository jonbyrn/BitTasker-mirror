/**
 * Review Aggregation Utilities
 * 
 * Functions for calculating review statistics and aggregations
 */

import type { NostrVerifiedReview, ReviewStats } from '$lib/types/review';

/**
 * Calculate review statistics from a list of reviews
 * Handles both role-specific and legacy category formats
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
	
	// Legacy categories (for backward compatibility)
	let totalQuality = 0;
	let totalProfessionalism = 0;
	let totalTimeliness = 0;
	
	// Taskee-specific categories
	let totalWorkQuality = 0;
	let totalExperience = 0;
	let totalDeliverySpeed = 0;
	let taskeeCount = 0;
	
	// Tasker-specific categories
	let totalCommunication = 0;
	let totalClarity = 0;
	let totalPaymentTimeliness = 0;
	let taskerCount = 0;
	
	const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

	for (const review of reviews) {
		const overall = review.content.overallRating;
		totalOverall += overall;

		const categoryRatings = review.content.categoryRatings;
		const revieweeRole = review.content.revieweeRole;

		// Handle role-specific categories
		if (revieweeRole === 'taskee' && 'workQuality' in categoryRatings) {
			const taskeeRatings = categoryRatings as { workQuality: number; experience: number; deliverySpeed: number };
			totalWorkQuality += taskeeRatings.workQuality;
			totalExperience += taskeeRatings.experience;
			totalDeliverySpeed += taskeeRatings.deliverySpeed;
			taskeeCount++;
			
			// Also map to legacy for compatibility
			totalQuality += taskeeRatings.workQuality;
			totalProfessionalism += taskeeRatings.experience;
			totalTimeliness += taskeeRatings.deliverySpeed;
		} else if (revieweeRole === 'tasker' && 'communication' in categoryRatings) {
			const taskerRatings = categoryRatings as { communication: number; clarity: number; paymentTimeliness: number };
			totalCommunication += taskerRatings.communication;
			totalClarity += taskerRatings.clarity;
			totalPaymentTimeliness += taskerRatings.paymentTimeliness;
			taskerCount++;
			
			// Also map to legacy for compatibility
			totalQuality += taskerRatings.communication;
			totalProfessionalism += taskerRatings.clarity;
			totalTimeliness += taskerRatings.paymentTimeliness;
		} else if ('quality' in categoryRatings) {
			// Legacy format
			const legacyRatings = categoryRatings as { quality: number; professionalism: number; timeliness: number };
			totalQuality += legacyRatings.quality;
			totalProfessionalism += legacyRatings.professionalism;
			totalTimeliness += legacyRatings.timeliness;
		}

		// Round to nearest integer for distribution
		const roundedRating = Math.round(overall);
		if (roundedRating >= 1 && roundedRating <= 5) {
			ratingDistribution[roundedRating as keyof typeof ratingDistribution]++;
		}
	}

	const stats: ReviewStats = {
		totalReviews,
		averageRating: totalOverall / totalReviews,
		averageQuality: totalQuality / totalReviews,
		averageProfessionalism: totalProfessionalism / totalReviews,
		averageTimeliness: totalTimeliness / totalReviews,
		ratingDistribution
	};

	// Add role-specific averages if we have reviews for that role
	if (taskeeCount > 0) {
		stats.averageWorkQuality = totalWorkQuality / taskeeCount;
		stats.averageExperience = totalExperience / taskeeCount;
		stats.averageDeliverySpeed = totalDeliverySpeed / taskeeCount;
	}

	if (taskerCount > 0) {
		stats.averageCommunication = totalCommunication / taskerCount;
		stats.averageClarity = totalClarity / taskerCount;
		stats.averagePaymentTimeliness = totalPaymentTimeliness / taskerCount;
	}

	return stats;
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


