import { describe, it, expect } from 'vitest';
import {
	checkAvailabilityStaleness,
	checkRequestAvailabilityStaleness,
	validateAvailabilityTimestamp,
	getStalenessBadge,
	shouldRefreshAvailability,
	filterStaleAvailability,
	sortByStaleness,
	getFreshestAvailability
} from '$lib/utils/staleness-handler';
import type { AvailabilityResponse } from '$lib/types/scheduling';
import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { TimeSlotRequest } from '$lib/types/scheduling';

describe('Staleness Handler', () => {
	const now = Date.now();
	const oneHour = 60 * 60 * 1000;

	function createAvailabilityResponse(timestamp: number): AvailabilityResponse {
		return {
			messageType: 'availability-response',
			bidId: 'bid-1',
			taskId: 'task-1',
			taskerPubkey: 'tasker',
			taskeePubkey: 'taskee',
			timestamp,
			taskWindow: {
				start: now,
				end: now + 7 * 24 * 60 * 60 * 1000
			},
			profileAvailability: {
				timeSlots: [],
				timezone: 'UTC',
				noticeHours: 24,
				maxBookingsPerDay: 5,
				breakBetweenBookings: 60
			},
			blockedTimes: [],
			nonce: 'nonce-1'
		};
	}

	function createRequest(createdAt: number): RequestQueueItem {
		return {
			id: 'req-1',
			bidId: 'bid-1',
			taskId: 'task-1',
			taskerPubkey: 'tasker',
			taskeePubkey: 'taskee',
			type: 'time-slot-request',
			status: 'pending',
			createdAt,
			expiresAt: createdAt + 15 * 60 * 1000,
			lastUpdated: createdAt,
			request: {
				messageType: 'time-slot-request',
				requestId: 'req-1',
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker',
				taskeePubkey: 'taskee',
				requestedStartTime: now + oneHour,
				requestedEndTime: now + 2 * oneHour,
				timestamp: createdAt,
				expiresAt: createdAt + 15 * 60 * 1000,
				nonce: 'nonce-1'
			} as TimeSlotRequest
		};
	}

	describe('checkAvailabilityStaleness', () => {
		it('should detect fresh availability', () => {
			const availability = createAvailabilityResponse(now - 5 * 60 * 1000); // 5 minutes ago
			const result = checkAvailabilityStaleness(availability);

			expect(result.isStale).toBe(false);
			expect(result.isWarning).toBe(false);
		});

		it('should detect warning state', () => {
			const availability = createAvailabilityResponse(now - 20 * 60 * 1000); // 20 minutes ago
			const result = checkAvailabilityStaleness(availability);

			expect(result.isWarning).toBe(true);
			expect(result.isStale).toBe(false);
		});

		it('should detect stale availability', () => {
			const availability = createAvailabilityResponse(now - 35 * 60 * 1000); // 35 minutes ago
			const result = checkAvailabilityStaleness(availability);

			expect(result.isStale).toBe(true);
			expect(result.message).toBeDefined();
		});

		it('should use custom config', () => {
			const availability = createAvailabilityResponse(now - 10 * 60 * 1000); // 10 minutes ago
			const result = checkAvailabilityStaleness(availability, {
				maxAgeMinutes: 5,
				warningAgeMinutes: 3
			});

			expect(result.isStale).toBe(true);
		});
	});

	describe('checkRequestAvailabilityStaleness', () => {
		it('should detect stale request', () => {
			const request = createRequest(now - 35 * 60 * 1000); // 35 minutes ago
			const result = checkRequestAvailabilityStaleness(request, {
				maxAgeMinutes: 30
			});

			expect(result).toBeDefined();
			expect(result?.isStale).toBe(true);
		});

		it('should return null for fresh request', () => {
			const request = createRequest(now - 10 * 60 * 1000); // 10 minutes ago
			const result = checkRequestAvailabilityStaleness(request);

			expect(result).toBeNull();
		});
	});

	describe('validateAvailabilityTimestamp', () => {
		it('should validate fresh timestamp', () => {
			const result = validateAvailabilityTimestamp(now - 10 * 60 * 1000);

			expect(result.isValid).toBe(true);
			expect(result.isStale).toBe(false);
		});

		it('should detect stale timestamp', () => {
			const result = validateAvailabilityTimestamp(now - 35 * 60 * 1000);

			expect(result.isValid).toBe(false);
			expect(result.isStale).toBe(true);
			expect(result.error).toBeDefined();
		});

		it('should reject future timestamp', () => {
			const result = validateAvailabilityTimestamp(now + 60 * 1000);

			expect(result.isValid).toBe(false);
			expect(result.isStale).toBe(false);
			expect(result.error).toContain('future');
		});

		it('should reject invalid timestamp', () => {
			const result = validateAvailabilityTimestamp(0);

			expect(result.isValid).toBe(false);
			expect(result.error).toBeDefined();
		});
	});

	describe('getStalenessBadge', () => {
		it('should return badge for stale data', () => {
			const staleness = checkAvailabilityStaleness(
				createAvailabilityResponse(now - 35 * 60 * 1000)
			);
			const badge = getStalenessBadge(staleness);

			expect(badge).toBeDefined();
			expect(badge?.color).toBe('error');
			expect(badge?.label).toBe('Stale');
		});

		it('should return badge for warning state', () => {
			const staleness = checkAvailabilityStaleness(
				createAvailabilityResponse(now - 20 * 60 * 1000)
			);
			const badge = getStalenessBadge(staleness);

			expect(badge).toBeDefined();
			expect(badge?.color).toBe('warning');
			expect(badge?.label).toBe('Aging');
		});

		it('should return null for fresh data', () => {
			const staleness = checkAvailabilityStaleness(
				createAvailabilityResponse(now - 5 * 60 * 1000)
			);
			const badge = getStalenessBadge(staleness);

			expect(badge).toBeNull();
		});
	});

	describe('shouldRefreshAvailability', () => {
		it('should return true for stale data', () => {
			const availability = createAvailabilityResponse(now - 35 * 60 * 1000);
			const shouldRefresh = shouldRefreshAvailability(availability);

			expect(shouldRefresh).toBe(true);
		});

		it('should return false for fresh data', () => {
			const availability = createAvailabilityResponse(now - 5 * 60 * 1000);
			const shouldRefresh = shouldRefreshAvailability(availability);

			expect(shouldRefresh).toBe(false);
		});
	});

	describe('filterStaleAvailability', () => {
		it('should filter out stale availability', () => {
			const availabilityList = [
				createAvailabilityResponse(now - 5 * 60 * 1000), // Fresh
				createAvailabilityResponse(now - 35 * 60 * 1000), // Stale
				createAvailabilityResponse(now - 10 * 60 * 1000) // Fresh
			];

			const filtered = filterStaleAvailability(availabilityList);

			expect(filtered.length).toBe(2);
			expect(filtered.every((avail) => avail.timestamp > now - 30 * 60 * 1000)).toBe(true);
		});
	});

	describe('sortByStaleness', () => {
		it('should sort by staleness (freshest first)', () => {
			const data = [
				{ timestamp: now - 20 * 60 * 1000, id: 'old' },
				{ timestamp: now - 5 * 60 * 1000, id: 'fresh' },
				{ timestamp: now - 10 * 60 * 1000, id: 'medium' }
			];

			const sorted = sortByStaleness(data, true);

			expect(sorted[0].id).toBe('fresh');
			expect(sorted[1].id).toBe('medium');
			expect(sorted[2].id).toBe('old');
		});
	});

	describe('getFreshestAvailability', () => {
		it('should return freshest availability', () => {
			const availabilityList = [
				createAvailabilityResponse(now - 20 * 60 * 1000),
				createAvailabilityResponse(now - 5 * 60 * 1000),
				createAvailabilityResponse(now - 10 * 60 * 1000)
			];

			const freshest = getFreshestAvailability(availabilityList);

			expect(freshest).toBeDefined();
			expect(freshest?.timestamp).toBe(now - 5 * 60 * 1000);
		});

		it('should return null for empty list', () => {
			const freshest = getFreshestAvailability([]);

			expect(freshest).toBeNull();
		});
	});
});

