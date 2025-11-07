import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { SimplifiedTaskBid } from '$lib/types/bid';

export interface RequestScore {
	request: RequestQueueItem;
	score: number;
	breakdown: {
		urgency: number;
		bidAmount?: number;
		rating?: number;
		combinedValue?: number;
		timeSlotSpecificity: number;
		expiryProximity: number;
	};
	recommendation: 'high' | 'medium' | 'low';
	reason: string;
}

export interface ScoringOptions {
	bidData?: Map<string, SimplifiedTaskBid>; // Map of bidId -> bid data
	userRatings?: Map<string, number>; // Map of taskerPubkey -> rating
	preferHigherBids?: boolean; // Taskee preference
	preferHigherRatings?: boolean; // Taskee preference
	urgencyWeight?: number; // Weight for urgency factor (0-1)
	valueWeight?: number; // Weight for bid × rating value (0-1)
}

const DEFAULT_OPTIONS: Required<ScoringOptions> = {
	bidData: new Map(),
	userRatings: new Map(),
	preferHigherBids: true,
	preferHigherRatings: true,
	urgencyWeight: 0.4,
	valueWeight: 0.6
};

/**
 * Calculate urgency score based on expiry time
 * Higher score = more urgent
 */
export function calculateUrgencyScore(expiresAt: number, now: number = Date.now()): number {
	const timeUntilExpiry = expiresAt - now;
	if (timeUntilExpiry <= 0) return 100; // Expired = maximum urgency

	const minutesUntilExpiry = timeUntilExpiry / (60 * 1000);
	
	// Exponential decay: urgency increases as expiry approaches
	// Score ranges from 0 (far future) to 100 (expiring now)
	if (minutesUntilExpiry >= 60) return 0; // More than 1 hour = low urgency
	if (minutesUntilExpiry <= 0) return 100; // Expired = max urgency
	
	// Exponential curve: 60 minutes = 0, 0 minutes = 100
	const normalized = 1 - (minutesUntilExpiry / 60);
	return Math.pow(normalized, 0.5) * 100; // Square root for smoother curve
}

/**
 * Calculate expiry proximity score
 * Higher score = closer to expiry
 */
export function calculateExpiryProximity(expiresAt: number, now: number = Date.now()): number {
	const timeUntilExpiry = expiresAt - now;
	if (timeUntilExpiry <= 0) return 1.0; // Expired
	
	const minutesUntilExpiry = timeUntilExpiry / (60 * 1000);
	
	// Normalize to 0-1 range
	if (minutesUntilExpiry >= 60) return 0; // More than 1 hour
	if (minutesUntilExpiry <= 0) return 1.0; // Expired
	
	return 1 - (minutesUntilExpiry / 60);
}

/**
 * Calculate time slot specificity score
 * Specific time slots score higher than "soonest available"
 */
export function calculateTimeSlotSpecificity(request: RequestQueueItem): number {
	if (request.type === 'time-slot-request') {
		return 1.0; // Specific time slot = full score
	} else if (request.type === 'soonest-available-request') {
		return 0.5; // Less specific = lower score
	}
	return 0;
}

/**
 * Calculate combined value score (bid amount × rating)
 * Higher value = better offer
 */
export function calculateCombinedValue(
	bidAmount: number | undefined,
	rating: number | undefined,
	preferHigherBids: boolean = true,
	preferHigherRatings: boolean = true
): number {
	if (bidAmount === undefined && rating === undefined) {
		return 0;
	}

	// Normalize bid amount (assume max bid is $1000 for normalization)
	const normalizedBid = bidAmount !== undefined ? Math.min(bidAmount / 1000, 1) : 0.5;
	
	// Normalize rating (0-5 scale)
	const normalizedRating = rating !== undefined ? rating / 5 : 0.5;

	// Apply preferences
	const bidScore = preferHigherBids ? normalizedBid : 1 - normalizedBid;
	const ratingScore = preferHigherRatings ? normalizedRating : 1 - normalizedRating;

	// Combined value: bid × rating (multiplicative for synergy)
	return bidScore * ratingScore * 100; // Scale to 0-100
}

/**
 * Calculate comprehensive score for a request
 */
export function calculateRequestScore(
	request: RequestQueueItem,
	options: ScoringOptions = {}
): RequestScore {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const now = Date.now();

	// Get bid data if available
	const bidData = opts.bidData.get(request.bidId);
	const bidAmount = bidData?.amount;
	
	// Get user rating if available
	const userRating = opts.userRatings.get(request.taskerPubkey);
	
	// Calculate component scores
	const urgencyScore = calculateUrgencyScore(request.expiresAt, now);
	const expiryProximity = calculateExpiryProximity(request.expiresAt, now);
	const timeSlotSpecificity = calculateTimeSlotSpecificity(request);
	const combinedValue = calculateCombinedValue(
		bidAmount,
		userRating,
		opts.preferHigherBids,
		opts.preferHigherRatings
	);

	// Calculate weighted total score
	const urgencyComponent = urgencyScore * opts.urgencyWeight;
	const valueComponent = combinedValue * opts.valueWeight;
	const specificityBonus = timeSlotSpecificity * 10; // Small bonus for specificity
	
	const totalScore = urgencyComponent + valueComponent + specificityBonus;

	// Determine recommendation level
	let recommendation: 'high' | 'medium' | 'low';
	let reason: string;
	
	if (totalScore >= 70) {
		recommendation = 'high';
		reason = 'High-value offer with good urgency';
	} else if (totalScore >= 40) {
		recommendation = 'medium';
		reason = 'Moderate value offer';
	} else {
		recommendation = 'low';
		reason = 'Lower priority offer';
	}

	// Add specific reasons
	const reasons: string[] = [];
	if (urgencyScore > 50) {
		reasons.push('expiring soon');
	}
	if (combinedValue > 50) {
		reasons.push('high value');
	}
	if (timeSlotSpecificity === 1.0) {
		reasons.push('specific time slot');
	}
	if (userRating && userRating >= 4.5) {
		reasons.push('highly rated tasker');
	}
	
	if (reasons.length > 0) {
		reason = reasons.join(', ');
	}

	return {
		request,
		score: Math.round(totalScore * 100) / 100, // Round to 2 decimal places
		breakdown: {
			urgency: Math.round(urgencyScore * 100) / 100,
			bidAmount,
			rating: userRating,
			combinedValue: Math.round(combinedValue * 100) / 100,
			timeSlotSpecificity: Math.round(timeSlotSpecificity * 100) / 100,
			expiryProximity: Math.round(expiryProximity * 100) / 100
		},
		recommendation,
		reason
	};
}

/**
 * Score multiple requests and return sorted by score
 */
export function scoreRequests(
	requests: RequestQueueItem[],
	options: ScoringOptions = {}
): RequestScore[] {
	const scores = requests.map((request) => calculateRequestScore(request, options));
	
	// Sort by score (highest first)
	return scores.sort((a, b) => b.score - a.score);
}

/**
 * Find the best offer from scored requests
 */
export function findBestScoredOffer(
	requests: RequestQueueItem[],
	options: ScoringOptions = {}
): RequestScore | null {
	const scored = scoreRequests(requests, options);
	return scored.length > 0 ? scored[0] : null;
}

/**
 * Get recommendation badge for a score
 */
export function getRecommendationBadge(score: RequestScore): {
	label: string;
	color: string;
	icon: string;
} {
	switch (score.recommendation) {
		case 'high':
			return {
				label: 'Highly Recommended',
				color: 'success',
				icon: '⭐'
			};
		case 'medium':
			return {
				label: 'Good Option',
				color: 'info',
				icon: '✓'
			};
		case 'low':
			return {
				label: 'Consider',
				color: 'neutral',
				icon: '○'
			};
	}
}

