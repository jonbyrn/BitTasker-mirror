import type { AvailabilityResponse, AvailabilityUpdate } from '$lib/types/scheduling';
import { generateNonce } from '$lib/utils/scheduling-utils';

/**
 * Utilities for handling availability updates
 */

/**
 * Create an availability update message
 */
export function createAvailabilityUpdate(
	originalAvailability: AvailabilityResponse,
	updatedAvailability: AvailabilityResponse,
	taskerPubkey: string,
	taskeePubkey: string
): AvailabilityUpdate {
	return {
		messageType: 'availability-update',
		bidId: originalAvailability.bidId,
		taskId: originalAvailability.taskId,
		taskerPubkey,
		taskeePubkey,
		timestamp: Date.now(),
		updatedAvailability,
		nonce: generateNonce()
	};
}

/**
 * Check if availability has changed significantly
 * Returns true if blocked times or recommended time changed
 */
export function hasAvailabilityChanged(
	oldAvailability: AvailabilityResponse,
	newAvailability: AvailabilityResponse
): boolean {
	// Check if blocked times changed
	if (oldAvailability.blockedTimes.length !== newAvailability.blockedTimes.length) {
		return true;
	}

	// Check if any blocked time changed
	for (let i = 0; i < oldAvailability.blockedTimes.length; i++) {
		const oldBlocked = oldAvailability.blockedTimes[i];
		const newBlocked = newAvailability.blockedTimes[i];

		if (
			!newBlocked ||
			oldBlocked.startTime !== newBlocked.startTime ||
			oldBlocked.endTime !== newBlocked.endTime ||
			oldBlocked.taskId !== newBlocked.taskId
		) {
			return true;
		}
	}

	// Check if recommended time changed
	const oldRecommended = oldAvailability.recommendedTime;
	const newRecommended = newAvailability.recommendedTime;

	if (oldRecommended && newRecommended) {
		if (
			oldRecommended.startTime !== newRecommended.startTime ||
			oldRecommended.endTime !== newRecommended.endTime
		) {
			return true;
		}
	} else if (oldRecommended !== newRecommended) {
		return true;
	}

	return false;
}

