import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { TimeSlotRequest, SoonestAvailableRequest } from '$lib/types/scheduling';

export interface ConflictGroup {
	timeSlot: string; // Format: "startTime-endTime"
	startTime: number;
	endTime: number;
	requests: RequestQueueItem[];
	overlapMinutes: number; // Duration of overlap
}

export interface ConflictDetectionResult {
	conflicts: ConflictGroup[];
	totalConflicts: number;
	affectedRequests: Set<string>; // Request IDs involved in conflicts
}

/**
 * Check if two time ranges overlap
 */
export function timeRangesOverlap(
	start1: number,
	end1: number,
	start2: number,
	end2: number,
	toleranceMinutes: number = 0
): boolean {
	const toleranceMs = toleranceMinutes * 60 * 1000;
	return start1 - toleranceMs < end2 && start2 - toleranceMs < end1;
}

/**
 * Calculate overlap duration between two time ranges (in minutes)
 */
export function calculateOverlapMinutes(
	start1: number,
	end1: number,
	start2: number,
	end2: number
): number {
	const overlapStart = Math.max(start1, start2);
	const overlapEnd = Math.min(end1, end2);
	const overlapMs = Math.max(0, overlapEnd - overlapStart);
	return Math.floor(overlapMs / (60 * 1000));
}

/**
 * Extract time range from a request
 */
export function extractTimeRange(request: RequestQueueItem): { start: number; end: number } | null {
	if (request.type === 'time-slot-request') {
		const timeSlotRequest = request.request as TimeSlotRequest;
		return {
			start: timeSlotRequest.requestedStartTime,
			end: timeSlotRequest.requestedEndTime
		};
	} else if (request.type === 'soonest-available-request') {
		// Soonest available requests don't have a specific time range
		// They could conflict with any accepted time slot
		return null;
	}
	return null;
}

/**
 * Detect conflicts in a list of requests
 * Returns groups of requests that have overlapping time slots
 */
export function detectConflicts(
	requests: RequestQueueItem[],
	toleranceMinutes: number = 0
): ConflictDetectionResult {
	const conflicts: ConflictGroup[] = [];
	const conflictMap = new Map<string, ConflictGroup>();
	const affectedRequests = new Set<string>();

	// Only check pending requests
	const pendingRequests = requests.filter((r) => r.status === 'pending');

	// Compare each request with every other request
	for (let i = 0; i < pendingRequests.length; i++) {
		const request1 = pendingRequests[i];
		const timeRange1 = extractTimeRange(request1);

		// Skip if we can't extract time range (e.g., soonest-available without accepted time)
		if (!timeRange1) continue;

		for (let j = i + 1; j < pendingRequests.length; j++) {
			const request2 = pendingRequests[j];
			const timeRange2 = extractTimeRange(request2);

			// Skip if we can't extract time range
			if (!timeRange2) continue;

			// Check if time ranges overlap
			if (
				timeRangesOverlap(
					timeRange1.start,
					timeRange1.end,
					timeRange2.start,
					timeRange2.end,
					toleranceMinutes
				)
			) {
				// Calculate overlap
				const overlapMinutes = calculateOverlapMinutes(
					timeRange1.start,
					timeRange1.end,
					timeRange2.start,
					timeRange2.end
				);

				// Create conflict key (use the overlapping time range)
				const conflictStart = Math.max(timeRange1.start, timeRange2.start);
				const conflictEnd = Math.min(timeRange1.end, timeRange2.end);
				const conflictKey = `${conflictStart}-${conflictEnd}`;

				// Add to conflict map
				if (!conflictMap.has(conflictKey)) {
					conflictMap.set(conflictKey, {
						timeSlot: conflictKey,
						startTime: conflictStart,
						endTime: conflictEnd,
						requests: [],
						overlapMinutes
					});
				}

				const conflictGroup = conflictMap.get(conflictKey)!;

				// Add requests if not already in the group
				if (!conflictGroup.requests.find((r) => r.id === request1.id)) {
					conflictGroup.requests.push(request1);
					affectedRequests.add(request1.id);
				}
				if (!conflictGroup.requests.find((r) => r.id === request2.id)) {
					conflictGroup.requests.push(request2);
					affectedRequests.add(request2.id);
				}
			}
		}
	}

	// Convert map to array
	conflicts.push(...Array.from(conflictMap.values()));

	return {
		conflicts,
		totalConflicts: conflicts.length,
		affectedRequests
	};
}

/**
 * Check if a specific request is involved in any conflicts
 */
export function isRequestInConflict(
	request: RequestQueueItem,
	allRequests: RequestQueueItem[],
	toleranceMinutes: number = 0
): boolean {
	const timeRange = extractTimeRange(request);
	if (!timeRange) return false;

	const otherRequests = allRequests.filter((r) => r.id !== request.id && r.status === 'pending');

	for (const otherRequest of otherRequests) {
		const otherTimeRange = extractTimeRange(otherRequest);
		if (!otherTimeRange) continue;

		if (
			timeRangesOverlap(
				timeRange.start,
				timeRange.end,
				otherTimeRange.start,
				otherTimeRange.end,
				toleranceMinutes
			)
		) {
			return true;
		}
	}

	return false;
}

/**
 * Find alternative time slots for a request that conflicts with others
 * Returns available slots that don't conflict with accepted/pending requests
 */
export function findAlternativeSlots(
	request: RequestQueueItem,
	allRequests: RequestQueueItem[],
	availableSlots: Array<{ startTime: number; endTime: number; duration: number }>,
	toleranceMinutes: number = 15 // Minimum gap between slots
): Array<{ startTime: number; endTime: number; duration: number }> {
	const originalTimeRange = extractTimeRange(request);
	if (!originalTimeRange) return [];

	// Get all blocked time ranges (accepted requests and other pending requests)
	const blockedRanges: Array<{ start: number; end: number }> = [];

	for (const otherRequest of allRequests) {
		if (otherRequest.id === request.id) continue;

		// Include accepted requests (they're definitely blocked)
		if (otherRequest.status === 'accepted' && otherRequest.acceptedTime) {
			blockedRanges.push({
				start: otherRequest.acceptedTime.startTime,
				end: otherRequest.acceptedTime.endTime
			});
		}

		// Include pending requests (they might be accepted)
		if (otherRequest.status === 'pending') {
			const timeRange = extractTimeRange(otherRequest);
			if (timeRange) {
				blockedRanges.push(timeRange);
			}
		}
	}

	// Filter available slots that don't conflict with blocked ranges
	const alternatives = availableSlots.filter((slot) => {
		// Calculate slot end time
		const slotEndTime = slot.startTime + slot.duration * 60 * 1000;

		// Check if slot conflicts with any blocked range
		for (const blocked of blockedRanges) {
			if (
				timeRangesOverlap(
					slot.startTime,
					slotEndTime,
					blocked.start,
					blocked.end,
					toleranceMinutes
				)
			) {
				return false;
			}
		}

		// Also exclude the original requested time range
		if (
			timeRangesOverlap(
				slot.startTime,
				slotEndTime,
				originalTimeRange.start,
				originalTimeRange.end,
				toleranceMinutes
			)
		) {
			return false;
		}

		return true;
	});

	return alternatives;
}

/**
 * Calculate a score for a request to help determine "best offer"
 * Higher score = better offer
 */
export function calculateRequestScore(request: RequestQueueItem): number {
	let score = 0;

	// Base score from bid amount (if available)
	// Note: This would need bid data, which might not be in RequestQueueItem
	// For now, we'll use other factors

	// Prefer requests that are closer to expiry (urgency)
	const now = Date.now();
	if (request.expiresAt) {
		const timeUntilExpiry = request.expiresAt - now;
		if (timeUntilExpiry > 0) {
			// More urgent requests get higher score (inverse of time until expiry)
			score += 1000000 / (timeUntilExpiry / 1000); // Normalize to seconds
		}
	}

	// Prefer requests with specific time slots over "soonest available"
	if (request.type === 'time-slot-request') {
		score += 100;
	}

	// Prefer requests from taskers with better ratings (if available)
	// This would require user profile data

	return score;
}

/**
 * Find the "best offer" from a group of conflicting requests
 */
export function findBestOffer(requests: RequestQueueItem[]): RequestQueueItem | null {
	if (requests.length === 0) return null;

	// Calculate scores for all requests
	const scoredRequests = requests.map((request) => ({
		request,
		score: calculateRequestScore(request)
	}));

	// Sort by score (highest first)
	scoredRequests.sort((a, b) => b.score - a.score);

	return scoredRequests[0].request;
}

/**
 * Group requests by conflict groups
 */
export function groupRequestsByConflicts(
	requests: RequestQueueItem[],
	toleranceMinutes: number = 0
): Map<string, RequestQueueItem[]> {
	const detectionResult = detectConflicts(requests, toleranceMinutes);
	const groups = new Map<string, RequestQueueItem[]>();

	for (const conflict of detectionResult.conflicts) {
		groups.set(conflict.timeSlot, conflict.requests);
	}

	return groups;
}

