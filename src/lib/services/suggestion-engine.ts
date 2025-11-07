import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { SimplifiedTaskBid } from '$lib/types/bid';
import {
	scoreRequests,
	findBestScoredOffer,
	type RequestScore,
	type ScoringOptions
} from '$lib/utils/request-scoring';
import { detectConflicts, findBestOffer } from '$lib/utils/conflict-detection';

export interface Suggestion {
	type: 'best-offer' | 'urgent' | 'high-value' | 'conflict-resolution';
	request: RequestQueueItem;
	score?: RequestScore;
	priority: number; // Higher = more important
	message: string;
	actionLabel: string;
}

export interface SuggestionEngineOptions extends ScoringOptions {
	maxSuggestions?: number;
	includeConflictSuggestions?: boolean;
}

const DEFAULT_ENGINE_OPTIONS: Required<SuggestionEngineOptions> = {
	bidData: new Map(),
	userRatings: new Map(),
	preferHigherBids: true,
	preferHigherRatings: true,
	urgencyWeight: 0.4,
	valueWeight: 0.6,
	maxSuggestions: 5,
	includeConflictSuggestions: true
};

/**
 * Generate suggestions for a list of requests
 */
export function generateSuggestions(
	requests: RequestQueueItem[],
	options: SuggestionEngineOptions = {}
): Suggestion[] {
	const opts = { ...DEFAULT_ENGINE_OPTIONS, ...options };
	const suggestions: Suggestion[] = [];

	// Filter to pending requests only
	const pendingRequests = requests.filter((r) => r.status === 'pending');
	if (pendingRequests.length === 0) {
		return suggestions;
	}

	// Score all requests
	const scoredRequests = scoreRequests(pendingRequests, opts);
	const bestOffer = scoredRequests.length > 0 ? scoredRequests[0] : null;

	// 1. Best overall offer
	if (bestOffer) {
		suggestions.push({
			type: 'best-offer',
			request: bestOffer.request,
			score: bestOffer,
			priority: 100,
			message: `Best offer: ${bestOffer.reason}`,
			actionLabel: 'Accept Best Offer'
		});
	}

	// 2. Urgent requests (expiring soon)
	const urgentRequests = scoredRequests
		.filter((sr) => sr.breakdown.urgency > 70)
		.slice(0, 2);
	
	for (const urgent of urgentRequests) {
		if (!bestOffer || urgent.request.id !== bestOffer.request.id) {
			suggestions.push({
				type: 'urgent',
				request: urgent.request,
				score: urgent,
				priority: 80,
				message: `Urgent: Expires in ${Math.round((urgent.request.expiresAt - Date.now()) / (60 * 1000))} minutes`,
				actionLabel: 'Accept Urgent Request'
			});
		}
	}

	// 3. High-value requests (high bid × rating)
	const highValueRequests = scoredRequests
		.filter((sr) => sr.breakdown.combinedValue && sr.breakdown.combinedValue > 60)
		.slice(0, 2);
	
	for (const highValue of highValueRequests) {
		if (
			(!bestOffer || highValue.request.id !== bestOffer.request.id) &&
			!urgentRequests.some((u) => u.request.id === highValue.request.id)
		) {
			suggestions.push({
				type: 'high-value',
				request: highValue.request,
				score: highValue,
				priority: 70,
				message: `High value: ${highValue.reason}`,
				actionLabel: 'Accept High Value'
			});
		}
	}

	// 4. Conflict resolution suggestions
	if (opts.includeConflictSuggestions) {
		const conflictResult = detectConflicts(pendingRequests);
		
		for (const conflict of conflictResult.conflicts) {
			if (conflict.requests.length >= 2) {
				const bestInConflict = findBestOffer(conflict.requests);
				if (bestInConflict) {
					const scoredBest = scoredRequests.find((sr) => sr.request.id === bestInConflict.id);
					if (scoredBest) {
						suggestions.push({
							type: 'conflict-resolution',
							request: bestInConflict,
							score: scoredBest,
							priority: 60,
							message: `Conflict detected: ${conflict.requests.length} requests for same time slot. Best option: ${scoredBest.reason}`,
							actionLabel: 'Resolve Conflict'
						});
					}
				}
			}
		}
	}

	// Sort by priority and limit
	return suggestions
		.sort((a, b) => b.priority - a.priority)
		.slice(0, opts.maxSuggestions);
}

/**
 * Get top suggestions (simplified version)
 */
export function getTopSuggestions(
	requests: RequestQueueItem[],
	options: SuggestionEngineOptions = {}
): Suggestion[] {
	return generateSuggestions(requests, options);
}

/**
 * Get the best offer suggestion
 */
export function getBestOfferSuggestion(
	requests: RequestQueueItem[],
	options: ScoringOptions = {}
): Suggestion | null {
	const pendingRequests = requests.filter((r) => r.status === 'pending');
	if (pendingRequests.length === 0) return null;

	const bestOffer = findBestScoredOffer(pendingRequests, options);
	if (!bestOffer) return null;

	return {
		type: 'best-offer',
		request: bestOffer.request,
		score: bestOffer,
		priority: 100,
		message: `Best offer: ${bestOffer.reason}`,
		actionLabel: 'Accept Best Offer'
	};
}

/**
 * Get urgent suggestions
 */
export function getUrgentSuggestions(
	requests: RequestQueueItem[],
	options: ScoringOptions = {}
): Suggestion[] {
	const pendingRequests = requests.filter((r) => r.status === 'pending');
	if (pendingRequests.length === 0) return [];

	const scoredRequests = scoreRequests(pendingRequests, options);
	const urgent = scoredRequests.filter((sr) => sr.breakdown.urgency > 70);

	return urgent.map((sr) => ({
		type: 'urgent' as const,
		request: sr.request,
		score: sr,
		priority: 80,
		message: `Urgent: Expires in ${Math.round((sr.request.expiresAt - Date.now()) / (60 * 1000))} minutes`,
		actionLabel: 'Accept Urgent Request'
	}));
}

