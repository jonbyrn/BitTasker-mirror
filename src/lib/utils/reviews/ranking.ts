/**
 * User Ranking System based on Reviews
 *
 * Calculates a user's reputation tier based on their review metrics.
 * Designed to be extensible for future metrics like contracts completed, account age, etc.
 */

import type { ReviewStats } from '$lib/types/review';

/**
 * Reputation tiers from lowest to highest
 */
export type ReputationTier = 'newcomer' | 'rising' | 'established' | 'expert' | 'elite';

/**
 * Tier configuration with score thresholds and display info
 */
export interface TierConfig {
	tier: ReputationTier;
	minScore: number;
	maxScore: number;
	label: string;
	description: string;
	color: string;
	badgeClass: string;
}

/**
 * Input metrics for ranking calculation
 * Extensible to add more metrics in the future
 */
export interface RankingMetrics {
	/** Review statistics from aggregation.ts */
	reviewStats: ReviewStats | null;
	/** Number of contracts completed (optional, for future use) */
	contractsCompleted?: number;
	/** Account creation date in milliseconds (optional, for future use) */
	accountCreatedAt?: number;
	/** Profile completion percentage 0-100 (optional, for future use) */
	profileCompletion?: number;
}

/**
 * Result of ranking calculation
 */
export interface UserRanking {
	/** The user's reputation tier */
	tier: ReputationTier;
	/** Numeric score 0-100 */
	score: number;
	/** Tier configuration with labels and styling */
	tierConfig: TierConfig;
	/** Breakdown of how the score was calculated */
	breakdown: {
		ratingScore: number;
		volumeScore: number;
		recencyScore: number;
		consistencyScore: number;
	};
	/** Progress to next tier (0-100) */
	progressToNextTier: number;
	/** Next tier config (null if already at max) */
	nextTier: TierConfig | null;
}

/**
 * Tier definitions with score ranges and styling
 */
export const TIER_CONFIGS: readonly TierConfig[] = [
	{
		tier: 'newcomer',
		minScore: 0,
		maxScore: 19,
		label: 'Newcomer',
		description: 'Just getting started on BitTasker',
		color: 'text-base-content/60',
		badgeClass: 'badge-ghost'
	},
	{
		tier: 'rising',
		minScore: 20,
		maxScore: 39,
		label: 'Rising',
		description: 'Building a reputation with positive reviews',
		color: 'text-info',
		badgeClass: 'badge-info'
	},
	{
		tier: 'established',
		minScore: 40,
		maxScore: 59,
		label: 'Established',
		description: 'A trusted member of the community',
		color: 'text-success',
		badgeClass: 'badge-success'
	},
	{
		tier: 'expert',
		minScore: 60,
		maxScore: 79,
		label: 'Expert',
		description: 'Consistently delivering excellent results',
		color: 'text-warning',
		badgeClass: 'badge-warning'
	},
	{
		tier: 'elite',
		minScore: 80,
		maxScore: 100,
		label: 'Elite',
		description: 'Top performer with outstanding reviews',
		color: 'text-primary',
		badgeClass: 'badge-primary'
	}
] as const;

/**
 * Weight configuration for score calculation
 * Total should equal 1.0
 */
const WEIGHTS = {
	/** Weight for average rating (40%) */
	rating: 0.4,
	/** Weight for review volume (30%) */
	volume: 0.3,
	/** Weight for recency of reviews (20%) */
	recency: 0.2,
	/** Weight for rating consistency (10%) */
	consistency: 0.1
} as const;

/**
 * Volume thresholds for scoring
 */
const VOLUME_THRESHOLDS = {
	/** Minimum reviews for any volume score */
	min: 1,
	/** Reviews for medium volume score */
	medium: 5,
	/** Reviews for high volume score */
	high: 15,
	/** Reviews for max volume score */
	max: 30
} as const;

/**
 * Calculate rating score (0-100) based on average rating
 * Maps 1-5 star rating to 0-100 score
 */
function calculateRatingScore(averageRating: number): number {
	if (averageRating <= 0) return 0;
	// Map 1-5 to 0-100, with 3 being 50
	// Formula: (rating - 1) / 4 * 100
	return Math.min(100, Math.max(0, ((averageRating - 1) / 4) * 100));
}

/**
 * Calculate volume score (0-100) based on number of reviews
 * Uses logarithmic scaling for diminishing returns
 */
function calculateVolumeScore(totalReviews: number): number {
	if (totalReviews <= 0) return 0;
	if (totalReviews >= VOLUME_THRESHOLDS.max) return 100;

	// Logarithmic scaling: more reviews = higher score, but with diminishing returns
	const logScore = Math.log10(totalReviews + 1) / Math.log10(VOLUME_THRESHOLDS.max + 1);
	return Math.min(100, logScore * 100);
}

/**
 * Calculate recency score (0-100) based on recent review activity
 * Higher score for more recent reviews
 */
function calculateRecencyScore(recentReviewsCount: number, totalReviews: number): number {
	if (totalReviews <= 0) return 0;
	if (recentReviewsCount <= 0) return 20; // Base score for having reviews but none recent

	// Recent reviews as percentage of total, boosted
	const recentRatio = recentReviewsCount / totalReviews;
	const rawScore = recentRatio * 100;

	// Boost score if user has recent reviews (shows active engagement)
	const boost = Math.min(30, recentReviewsCount * 10);
	return Math.min(100, rawScore + boost);
}

/**
 * Calculate consistency score (0-100) based on rating distribution
 * Higher score for consistent (low variance) ratings
 */
function calculateConsistencyScore(
	ratingDistribution: Record<number, number>,
	totalReviews: number
): number {
	if (totalReviews <= 1) return 50; // Not enough data for consistency

	// Calculate standard deviation of ratings
	const ratings: number[] = [];
	for (const [rating, count] of Object.entries(ratingDistribution)) {
		for (let i = 0; i < count; i++) {
			ratings.push(Number(rating));
		}
	}

	if (ratings.length <= 1) return 50;

	const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
	const variance = ratings.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratings.length;
	const stdDev = Math.sqrt(variance);

	// Lower std dev = more consistent = higher score
	// Max std dev for 1-5 scale is ~2, so we map 0-2 to 100-0
	const consistencyScore = Math.max(0, 100 - stdDev * 50);
	return consistencyScore;
}

/**
 * Get tier configuration for a given score
 */
function getTierForScore(score: number): TierConfig {
	const tier = TIER_CONFIGS.find((t) => score >= t.minScore && score <= t.maxScore);
	return tier ?? TIER_CONFIGS[0];
}

/**
 * Get the next tier after the current one (or null if at max)
 */
function getNextTier(currentTier: ReputationTier): TierConfig | null {
	const currentIndex = TIER_CONFIGS.findIndex((t) => t.tier === currentTier);
	if (currentIndex === -1 || currentIndex >= TIER_CONFIGS.length - 1) return null;
	return TIER_CONFIGS[currentIndex + 1];
}

/**
 * Calculate progress to next tier (0-100)
 */
function calculateProgressToNextTier(
	score: number,
	currentTierConfig: TierConfig,
	nextTierConfig: TierConfig | null
): number {
	if (!nextTierConfig) return 100; // Already at max tier

	const tierRange = nextTierConfig.minScore - currentTierConfig.minScore;
	const progressInTier = score - currentTierConfig.minScore;
	return Math.min(100, Math.max(0, (progressInTier / tierRange) * 100));
}

/**
 * Calculate user ranking based on review metrics
 */
export function calculateUserRanking(metrics: RankingMetrics): UserRanking {
	const { reviewStats } = metrics;

	// Default to newcomer if no reviews
	if (!reviewStats || reviewStats.totalReviews === 0) {
		const tierConfig = TIER_CONFIGS[0];
		return {
			tier: 'newcomer',
			score: 0,
			tierConfig,
			breakdown: {
				ratingScore: 0,
				volumeScore: 0,
				recencyScore: 0,
				consistencyScore: 0
			},
			progressToNextTier: 0,
			nextTier: TIER_CONFIGS[1]
		};
	}

	// Calculate individual scores
	const ratingScore = calculateRatingScore(reviewStats.averageRating);
	const volumeScore = calculateVolumeScore(reviewStats.totalReviews);
	const recencyScore = calculateRecencyScore(
		reviewStats.recentReviewsCount,
		reviewStats.totalReviews
	);
	const consistencyScore = calculateConsistencyScore(
		reviewStats.ratingDistribution,
		reviewStats.totalReviews
	);

	// Calculate weighted total score
	const totalScore = Math.round(
		ratingScore * WEIGHTS.rating +
			volumeScore * WEIGHTS.volume +
			recencyScore * WEIGHTS.recency +
			consistencyScore * WEIGHTS.consistency
	);

	// Clamp score to 0-100
	const score = Math.min(100, Math.max(0, totalScore));

	// Get tier info
	const tierConfig = getTierForScore(score);
	const nextTier = getNextTier(tierConfig.tier);
	const progressToNextTier = calculateProgressToNextTier(score, tierConfig, nextTier);

	return {
		tier: tierConfig.tier,
		score,
		tierConfig,
		breakdown: {
			ratingScore: Math.round(ratingScore),
			volumeScore: Math.round(volumeScore),
			recencyScore: Math.round(recencyScore),
			consistencyScore: Math.round(consistencyScore)
		},
		progressToNextTier: Math.round(progressToNextTier),
		nextTier
	};
}

/**
 * Get a human-readable ranking summary
 */
export function getRankingSummary(ranking: UserRanking): string {
	if (ranking.score === 0) {
		return 'No reviews yet - complete tasks to build your reputation!';
	}

	const tierLabel = ranking.tierConfig.label;
	const nextTierLabel = ranking.nextTier?.label;

	if (!nextTierLabel) {
		return `${tierLabel} status - You've reached the top tier!`;
	}

	return `${tierLabel} status - ${ranking.progressToNextTier}% progress to ${nextTierLabel}`;
}

/**
 * Compare two rankings
 */
export function compareRankings(a: UserRanking, b: UserRanking): number {
	return b.score - a.score; // Higher score = better ranking
}
