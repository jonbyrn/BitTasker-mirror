import { describe, it, expect } from 'vitest';
import {
	createAvailabilityUpdate,
	hasAvailabilityChanged
} from '$lib/utils/availability-updates';
import type { AvailabilityResponse } from '$lib/types/scheduling';

describe('Availability Updates', () => {
	const now = Date.now();

	const createMockAvailability = (overrides?: Partial<AvailabilityResponse>): AvailabilityResponse => ({
		messageType: 'availability-response',
		bidId: 'bid-123',
		taskId: 'task-123',
		taskerPubkey: 'tasker-pubkey',
		taskeePubkey: 'taskee-pubkey',
		timestamp: now,
		taskWindow: {
			start: now + 24 * 60 * 60 * 1000,
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
		nonce: 'test-nonce',
		...overrides
	});

	describe('createAvailabilityUpdate', () => {
		it('should create availability update message', () => {
			const original = createMockAvailability();
			const updated = createMockAvailability({
				blockedTimes: [
					{
						startTime: now + 2 * 24 * 60 * 60 * 1000,
						endTime: now + 2 * 24 * 60 * 60 * 1000 + 3600000,
						taskId: 'new-task'
					}
				]
			});

			const update = createAvailabilityUpdate(original, updated, 'tasker-pubkey', 'taskee-pubkey');

			expect(update.messageType).toBe('availability-update');
			expect(update.bidId).toBe(original.bidId);
			expect(update.taskId).toBe(original.taskId);
			expect(update.taskerPubkey).toBe('tasker-pubkey');
			expect(update.taskeePubkey).toBe('taskee-pubkey');
			expect(update.timestamp).toBeGreaterThan(0);
			expect(update.updatedAvailability).toEqual(updated);
			expect(update.nonce).toBeDefined();
		});
	});

	describe('hasAvailabilityChanged', () => {
		it('should return true if blocked times changed', () => {
			const oldAvailability = createMockAvailability({
				blockedTimes: []
			});

			const newAvailability = createMockAvailability({
				blockedTimes: [
					{
						startTime: now + 2 * 24 * 60 * 60 * 1000,
						endTime: now + 2 * 24 * 60 * 60 * 1000 + 3600000,
						taskId: 'new-task'
					}
				]
			});

			expect(hasAvailabilityChanged(oldAvailability, newAvailability)).toBe(true);
		});

		it('should return true if blocked time details changed', () => {
			const oldAvailability = createMockAvailability({
				blockedTimes: [
					{
						startTime: now + 2 * 24 * 60 * 60 * 1000,
						endTime: now + 2 * 24 * 60 * 60 * 1000 + 3600000,
						taskId: 'task-1'
					}
				]
			});

			const newAvailability = createMockAvailability({
				blockedTimes: [
					{
						startTime: now + 3 * 24 * 60 * 60 * 1000, // Different time
						endTime: now + 3 * 24 * 60 * 60 * 1000 + 3600000,
						taskId: 'task-1'
					}
				]
			});

			expect(hasAvailabilityChanged(oldAvailability, newAvailability)).toBe(true);
		});

		it('should return true if recommended time changed', () => {
			const oldAvailability = createMockAvailability({
				recommendedTime: {
					startTime: now + 2 * 24 * 60 * 60 * 1000,
					endTime: now + 2 * 24 * 60 * 60 * 1000 + 3600000
				}
			});

			const newAvailability = createMockAvailability({
				recommendedTime: {
					startTime: now + 3 * 24 * 60 * 60 * 1000, // Different time
					endTime: now + 3 * 24 * 60 * 60 * 1000 + 3600000
				}
			});

			expect(hasAvailabilityChanged(oldAvailability, newAvailability)).toBe(true);
		});

		it('should return true if recommended time added', () => {
			const oldAvailability = createMockAvailability({
				recommendedTime: undefined
			});

			const newAvailability = createMockAvailability({
				recommendedTime: {
					startTime: now + 2 * 24 * 60 * 60 * 1000,
					endTime: now + 2 * 24 * 60 * 60 * 1000 + 3600000
				}
			});

			expect(hasAvailabilityChanged(oldAvailability, newAvailability)).toBe(true);
		});

		it('should return true if recommended time removed', () => {
			const oldAvailability = createMockAvailability({
				recommendedTime: {
					startTime: now + 2 * 24 * 60 * 60 * 1000,
					endTime: now + 2 * 24 * 60 * 60 * 1000 + 3600000
				}
			});

			const newAvailability = createMockAvailability({
				recommendedTime: undefined
			});

			expect(hasAvailabilityChanged(oldAvailability, newAvailability)).toBe(true);
		});

		it('should return false if nothing changed', () => {
			const availability = createMockAvailability({
				blockedTimes: [
					{
						startTime: now + 2 * 24 * 60 * 60 * 1000,
						endTime: now + 2 * 24 * 60 * 60 * 1000 + 3600000,
						taskId: 'task-1'
					}
				],
				recommendedTime: {
					startTime: now + 3 * 24 * 60 * 60 * 1000,
					endTime: now + 3 * 24 * 60 * 60 * 1000 + 3600000
				}
			});

			expect(hasAvailabilityChanged(availability, availability)).toBe(false);
		});

		it('should return false if only profile availability changed (not tracked)', () => {
			const oldAvailability = createMockAvailability({
				profileAvailability: {
					timeSlots: [{ day: 1, start: '09:00', end: '17:00' }],
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			});

			const newAvailability = createMockAvailability({
				profileAvailability: {
					timeSlots: [{ day: 2, start: '10:00', end: '18:00' }], // Different slots
					timezone: 'America/New_York',
					noticeHours: 48,
					maxBookingsPerDay: 3,
					breakBetweenBookings: 30
				}
			});

			// Profile availability changes are not tracked (only blocked times and recommended time)
			expect(hasAvailabilityChanged(oldAvailability, newAvailability)).toBe(false);
		});
	});
});

