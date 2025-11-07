import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { TimeSlotRequest, SoonestAvailableRequest } from '$lib/types/scheduling';

export interface AbusePattern {
	type: 'rapid-requests' | 'duplicate-requests' | 'spam-time-slots' | 'suspicious-activity';
	severity: 'low' | 'medium' | 'high';
	description: string;
	affectedRequests: string[]; // Request IDs
}

export interface AbuseDetectionResult {
	isAbuse: boolean;
	patterns: AbusePattern[];
	recommendation: 'allow' | 'warn' | 'block';
}

/**
 * Detect rapid request patterns (too many requests in short time)
 */
export function detectRapidRequests(
	requests: RequestQueueItem[],
	maxRequestsPerMinute: number = 5
): AbusePattern | null {
	const now = Date.now();
	const oneMinuteAgo = now - 60 * 1000;

	// Group requests by tasker
	const requestsByTasker = new Map<string, RequestQueueItem[]>();
	for (const request of requests) {
		if (!requestsByTasker.has(request.taskerPubkey)) {
			requestsByTasker.set(request.taskerPubkey, []);
		}
		requestsByTasker.get(request.taskerPubkey)!.push(request);
	}

	for (const [taskerPubkey, taskerRequests] of requestsByTasker.entries()) {
		const recentRequests = taskerRequests.filter(
			(r) => r.timestamp >= oneMinuteAgo && r.status === 'pending'
		);

		if (recentRequests.length > maxRequestsPerMinute) {
			return {
				type: 'rapid-requests',
				severity: recentRequests.length > 10 ? 'high' : 'medium',
				description: `User ${taskerPubkey.substring(0, 8)}... sent ${recentRequests.length} requests in the last minute`,
				affectedRequests: recentRequests.map((r) => r.id)
			};
		}
	}

	return null;
}

/**
 * Detect duplicate requests (same time slot requested multiple times)
 */
export function detectDuplicateRequests(
	requests: RequestQueueItem[]
): AbusePattern | null {
	const timeSlotMap = new Map<string, RequestQueueItem[]>();

	for (const request of requests) {
		if (request.type === 'time-slot-request' && request.status === 'pending') {
			const timeSlotRequest = request.request as TimeSlotRequest;
			const key = `${request.taskerPubkey}-${timeSlotRequest.requestedStartTime}-${timeSlotRequest.requestedEndTime}`;

			if (!timeSlotMap.has(key)) {
				timeSlotMap.set(key, []);
			}
			timeSlotMap.get(key)!.push(request);
		}
	}

	for (const [key, duplicateRequests] of timeSlotMap.entries()) {
		if (duplicateRequests.length > 1) {
			// Check if they're from the same tasker (likely accidental) or different taskers (normal conflict)
			const uniqueTaskers = new Set(duplicateRequests.map((r) => r.taskerPubkey));
			
			if (uniqueTaskers.size === 1 && duplicateRequests.length > 2) {
				// Same tasker sending multiple duplicate requests
				return {
					type: 'duplicate-requests',
					severity: 'medium',
					description: `User sent ${duplicateRequests.length} duplicate requests for the same time slot`,
					affectedRequests: duplicateRequests.map((r) => r.id)
				};
			}
		}
	}

	return null;
}

/**
 * Detect spam time slots (requesting many different time slots rapidly)
 */
export function detectSpamTimeSlots(
	requests: RequestQueueItem[],
	maxUniqueSlotsPerHour: number = 20
): AbusePattern | null {
	const now = Date.now();
	const oneHourAgo = now - 60 * 60 * 1000;

	// Group requests by tasker
	const requestsByTasker = new Map<string, RequestQueueItem[]>();
	for (const request of requests) {
		if (request.timestamp >= oneHourAgo && request.status === 'pending') {
			if (!requestsByTasker.has(request.taskerPubkey)) {
				requestsByTasker.set(request.taskerPubkey, []);
			}
			requestsByTasker.get(request.taskerPubkey)!.push(request);
		}
	}

	for (const [taskerPubkey, taskerRequests] of requestsByTasker.entries()) {
		// Count unique time slots
		const uniqueSlots = new Set<string>();
		
		for (const request of taskerRequests) {
			if (request.type === 'time-slot-request') {
				const timeSlotRequest = request.request as TimeSlotRequest;
				const slotKey = `${timeSlotRequest.requestedStartTime}-${timeSlotRequest.requestedEndTime}`;
				uniqueSlots.add(slotKey);
			}
		}

		if (uniqueSlots.size > maxUniqueSlotsPerHour) {
			return {
				type: 'spam-time-slots',
				severity: uniqueSlots.size > 50 ? 'high' : 'medium',
				description: `User requested ${uniqueSlots.size} different time slots in the last hour`,
				affectedRequests: taskerRequests.map((r) => r.id)
			};
		}
	}

	return null;
}

/**
 * Comprehensive abuse detection
 */
export function detectAbuse(requests: RequestQueueItem[]): AbuseDetectionResult {
	const patterns: AbusePattern[] = [];

	// Check for rapid requests
	const rapidPattern = detectRapidRequests(requests);
	if (rapidPattern) {
		patterns.push(rapidPattern);
	}

	// Check for duplicate requests
	const duplicatePattern = detectDuplicateRequests(requests);
	if (duplicatePattern) {
		patterns.push(duplicatePattern);
	}

	// Check for spam time slots
	const spamPattern = detectSpamTimeSlots(requests);
	if (spamPattern) {
		patterns.push(spamPattern);
	}

	// Determine recommendation
	let recommendation: 'allow' | 'warn' | 'block' = 'allow';
	const highSeverityCount = patterns.filter((p) => p.severity === 'high').length;
	const mediumSeverityCount = patterns.filter((p) => p.severity === 'medium').length;

	if (highSeverityCount > 0) {
		recommendation = 'block';
	} else if (mediumSeverityCount >= 2 || patterns.length >= 3) {
		recommendation = 'warn';
	}

	return {
		isAbuse: patterns.length > 0,
		patterns,
		recommendation
	};
}

/**
 * Validate request for abuse patterns before adding to queue
 */
export function validateRequestForAbuse(
	newRequest: TimeSlotRequest | SoonestAvailableRequest,
	existingRequests: RequestQueueItem[]
): { valid: boolean; reason?: string; pattern?: AbusePattern } {
	// Check for duplicate request (same requestId)
	const duplicate = existingRequests.find((r) => r.id === newRequest.requestId);
	if (duplicate) {
		return {
			valid: false,
			reason: 'Duplicate request ID',
			pattern: {
				type: 'duplicate-requests',
				severity: 'low',
				description: 'Request with same ID already exists',
				affectedRequests: [newRequest.requestId]
			}
		};
	}

	// Check for rapid requests from same tasker
	const taskerRequests = existingRequests.filter(
		(r) => r.taskerPubkey === newRequest.taskerPubkey && r.status === 'pending'
	);
	const now = Date.now();
	const oneMinuteAgo = now - 60 * 1000;
	const recentRequests = taskerRequests.filter((r) => r.timestamp > oneMinuteAgo); // Use > instead of >= to include requests within the last minute

	if (recentRequests.length >= 5) {
		return {
			valid: false,
			reason: 'Too many requests in short time',
			pattern: {
				type: 'rapid-requests',
				severity: recentRequests.length >= 10 ? 'high' : 'medium',
				description: `${recentRequests.length} requests in the last minute`,
				affectedRequests: [...recentRequests.map((r) => r.id), newRequest.requestId]
			}
		};
	}

	return { valid: true };
}

