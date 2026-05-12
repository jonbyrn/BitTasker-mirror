/**
 * Review Aggregation Utilities
 *
 * Functions for calculating review statistics and aggregations
 */

import type { AttestedReview, ReviewStats } from '$lib/types/review';

type ReviewContentLike = {
	overallRating?: unknown;
	categoryRatings?: unknown;
	revieweeRole?: unknown;
	comment?: unknown;
	photos?: unknown;
};

function isValidRating(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 5;
}

function isValidLegacyCategoryRatings(
	categoryRatings: unknown
): categoryRatings is { quality: number; professionalism: number; timeliness: number } {
	if (!categoryRatings || typeof categoryRatings !== 'object') {
		return false;
	}

	return (
		isValidRating((categoryRatings as { quality?: unknown }).quality) &&
		isValidRating((categoryRatings as { professionalism?: unknown }).professionalism) &&
		isValidRating((categoryRatings as { timeliness?: unknown }).timeliness)
	);
}

function isValidTaskeeCategoryRatings(
	categoryRatings: unknown
): categoryRatings is { workQuality: number; experience: number; deliverySpeed: number } {
	if (!categoryRatings || typeof categoryRatings !== 'object') {
		return false;
	}

	return (
		isValidRating((categoryRatings as { workQuality?: unknown }).workQuality) &&
		isValidRating((categoryRatings as { experience?: unknown }).experience) &&
		isValidRating((categoryRatings as { deliverySpeed?: unknown }).deliverySpeed)
	);
}

function isValidTaskerCategoryRatings(
	categoryRatings: unknown
): categoryRatings is { communication: number; clarity: number; paymentTimeliness: number } {
	if (!categoryRatings || typeof categoryRatings !== 'object') {
		return false;
	}

	return (
		isValidRating((categoryRatings as { communication?: unknown }).communication) &&
		isValidRating((categoryRatings as { clarity?: unknown }).clarity) &&
		isValidRating((categoryRatings as { paymentTimeliness?: unknown }).paymentTimeliness)
	);
}

function getEmptyStats(): ReviewStats {
	return {
		totalReviews: 0,
		recentReviewsCount: 0,
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

function getReviewContent(review: AttestedReview): ReviewContentLike | null {
	if (!review || typeof review !== 'object') {
		return null;
	}

	const content = (review as { content?: unknown }).content;
	if (!content || typeof content !== 'object') {
		return null;
	}

	return content as ReviewContentLike;
}

function isNonEmptyComment(value: unknown): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}

function hasPhotoAttachments(value: unknown): boolean {
	return Array.isArray(value) && value.length > 0;
}

function getSortableTimestamp(review: AttestedReview): number {
	const createdAt = review?.createdAt;
	return typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : 0;
}

function getSortableRating(review: AttestedReview): number | null {
	const overallRating = getReviewContent(review)?.overallRating;
	return isValidRating(overallRating) ? overallRating : null;
}

/**
 * Calculate review statistics from a list of reviews
 * Handles both role-specific and legacy category formats
 */
export function calculateReviewStats(reviews: AttestedReview[]): ReviewStats {
	if (reviews.length === 0) {
		return getEmptyStats();
	}

	const recentThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
	let recentReviewsCount = 0;
	let totalOverall = 0;
	let validReviewsCount = 0;
	let qualityCount = 0;
	let professionalismCount = 0;
	let timelinessCount = 0;

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
		const content = getReviewContent(review);
		if (!content) {
			continue;
		}

		const overall = content.overallRating;
		if (!isValidRating(overall)) {
			continue;
		}

		totalOverall += overall;
		validReviewsCount++;
		if (review.createdAt >= recentThreshold) {
			recentReviewsCount++;
		}

		const categoryRatings = content.categoryRatings;
		const revieweeRole = content.revieweeRole;

		// Handle role-specific categories
		if (revieweeRole === 'taskee' && isValidTaskeeCategoryRatings(categoryRatings)) {
			const taskeeRatings = categoryRatings;
			totalWorkQuality += taskeeRatings.workQuality;
			totalExperience += taskeeRatings.experience;
			totalDeliverySpeed += taskeeRatings.deliverySpeed;
			taskeeCount++;

			// Also map to legacy for compatibility
			totalQuality += taskeeRatings.workQuality;
			totalProfessionalism += taskeeRatings.experience;
			totalTimeliness += taskeeRatings.deliverySpeed;
			qualityCount++;
			professionalismCount++;
			timelinessCount++;
		} else if (revieweeRole === 'tasker' && isValidTaskerCategoryRatings(categoryRatings)) {
			const taskerRatings = categoryRatings;
			totalCommunication += taskerRatings.communication;
			totalClarity += taskerRatings.clarity;
			totalPaymentTimeliness += taskerRatings.paymentTimeliness;
			taskerCount++;

			// Also map to legacy for compatibility
			totalQuality += taskerRatings.communication;
			totalProfessionalism += taskerRatings.clarity;
			totalTimeliness += taskerRatings.paymentTimeliness;
			qualityCount++;
			professionalismCount++;
			timelinessCount++;
		} else if (isValidLegacyCategoryRatings(categoryRatings)) {
			// Legacy format
			const legacyRatings = categoryRatings;
			totalQuality += legacyRatings.quality;
			totalProfessionalism += legacyRatings.professionalism;
			totalTimeliness += legacyRatings.timeliness;
			qualityCount++;
			professionalismCount++;
			timelinessCount++;
		}

		// Round to nearest integer for distribution
		const roundedRating = Math.round(overall);
		if (roundedRating >= 1 && roundedRating <= 5) {
			ratingDistribution[roundedRating as keyof typeof ratingDistribution]++;
		}
	}

	if (validReviewsCount === 0) {
		return getEmptyStats();
	}

	const stats: ReviewStats = {
		totalReviews: validReviewsCount,
		recentReviewsCount,
		averageRating: totalOverall / validReviewsCount,
		averageQuality: qualityCount > 0 ? totalQuality / qualityCount : 0,
		averageProfessionalism:
			professionalismCount > 0 ? totalProfessionalism / professionalismCount : 0,
		averageTimeliness: timelinessCount > 0 ? totalTimeliness / timelinessCount : 0,
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
	reviews: AttestedReview[],
	filter: {
		minRating?: number;
		maxRating?: number;
		hasComment?: boolean;
		hasPhotos?: boolean;
		dateFrom?: number;
		dateTo?: number;
	}
): AttestedReview[] {
	return reviews.filter((review) => {
		const content = getReviewContent(review);
		const overallRating = content?.overallRating;
		const createdAt = review.createdAt;

		if (
			filter.minRating !== undefined &&
			(typeof overallRating !== 'number' || overallRating < filter.minRating)
		) {
			return false;
		}
		if (
			filter.maxRating !== undefined &&
			(typeof overallRating !== 'number' || overallRating > filter.maxRating)
		) {
			return false;
		}
		if (filter.hasComment && !isNonEmptyComment(content?.comment)) {
			return false;
		}
		if (filter.hasPhotos && !hasPhotoAttachments(content?.photos)) {
			return false;
		}
		if (filter.dateFrom !== undefined && createdAt < filter.dateFrom) {
			return false;
		}
		if (filter.dateTo !== undefined && createdAt > filter.dateTo) {
			return false;
		}
		return true;
	});
}

/**
 * Sort reviews
 */
export function sortReviews(
	reviews: AttestedReview[],
	sortBy: 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating'
): AttestedReview[] {
	const sorted = [...reviews];

	switch (sortBy) {
		case 'newest':
			return sorted.sort((a, b) => getSortableTimestamp(b) - getSortableTimestamp(a));
		case 'oldest':
			return sorted.sort((a, b) => getSortableTimestamp(a) - getSortableTimestamp(b));
		case 'highest_rating': {
			return sorted.sort((a, b) => {
				const leftRating = getSortableRating(a);
				const rightRating = getSortableRating(b);

				if (leftRating === null && rightRating === null) {
					return getSortableTimestamp(b) - getSortableTimestamp(a);
				}
				if (leftRating === null) {
					return 1;
				}
				if (rightRating === null) {
					return -1;
				}
				if (rightRating !== leftRating) {
					return rightRating - leftRating;
				}

				return getSortableTimestamp(b) - getSortableTimestamp(a);
			});
		}
		case 'lowest_rating': {
			return sorted.sort((a, b) => {
				const leftRating = getSortableRating(a);
				const rightRating = getSortableRating(b);

				if (leftRating === null && rightRating === null) {
					return getSortableTimestamp(b) - getSortableTimestamp(a);
				}
				if (leftRating === null) {
					return 1;
				}
				if (rightRating === null) {
					return -1;
				}
				if (leftRating !== rightRating) {
					return leftRating - rightRating;
				}

				return getSortableTimestamp(b) - getSortableTimestamp(a);
			});
		}
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
