import { describe, it, expect } from 'vitest';
import {
	calculateAvailableSlots,
	findSoonestAvailableSlot,
	isTimeSlotAvailable
} from '$lib/utils/availability-calculator';
import type { AvailabilityResponse } from '$lib/types/scheduling';

describe('Availability Calculator', () => {
	const now = Date.now();
	const tomorrow = now + 24 * 60 * 60 * 1000;
	const nextWeek = now + 7 * 24 * 60 * 60 * 1000;

	const createMockAvailability = (overrides?: Partial<AvailabilityResponse>): AvailabilityResponse => ({
		messageType: 'availability-response',
		bidId: 'bid-123',
		taskId: 'task-123',
		taskerPubkey: 'tasker-pubkey',
		taskeePubkey: 'taskee-pubkey',
		timestamp: now,
		taskWindow: {
			start: tomorrow,
			end: nextWeek
		},
		profileAvailability: {
			timeSlots: [
				{ day: 1, start: '09:00', end: '17:00' }, // Monday
				{ day: 2, start: '09:00', end: '17:00' } // Tuesday
			],
			timezone: 'UTC',
			noticeHours: 24,
			maxBookingsPerDay: 5,
			breakBetweenBookings: 60
		},
		blockedTimes: [],
		nonce: 'test-nonce',
		...overrides
	});

	describe('calculateAvailableSlots', () => {
		it('should calculate available slots from time slots', () => {
			const availability = createMockAvailability();
			const slots = calculateAvailableSlots(availability, 60); // 1 hour duration

			expect(slots.length).toBeGreaterThan(0);
			expect(slots.every((slot) => slot.duration === 60)).toBe(true);
			expect(slots.every((slot) => slot.startTime < slot.endTime)).toBe(true);
		});

		it('should respect notice hours', () => {
			const availability = createMockAvailability({
				profileAvailability: {
					timeSlots: [{ day: new Date(now).getDay(), start: '09:00', end: '17:00' }],
					timezone: 'UTC',
					noticeHours: 48, // 48 hours notice
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			});

			const slots = calculateAvailableSlots(availability, 60);
			const noticeMs = 48 * 60 * 60 * 1000;

			// All slots should be at least noticeMs in the future
			expect(slots.every((slot) => slot.startTime >= now + noticeMs)).toBe(true);
		});

		it('should filter out blocked times', () => {
			const blockedStart = tomorrow + 2 * 24 * 60 * 60 * 1000; // 2 days from now
			const blockedEnd = blockedStart + 2 * 60 * 60 * 1000; // 2 hours later

			const availability = createMockAvailability({
				blockedTimes: [
					{
						startTime: blockedStart,
						endTime: blockedEnd,
						taskId: 'blocked-task'
					}
				]
			});

			const slots = calculateAvailableSlots(availability, 60);

			// No slots should overlap with blocked time
			expect(
				slots.every(
					(slot) => slot.endTime <= blockedStart || slot.startTime >= blockedEnd
				)
			).toBe(true);
		});

		it('should respect max bookings per day', () => {
			const availability = createMockAvailability({
				profileAvailability: {
					timeSlots: [{ day: 1, start: '09:00', end: '17:00' }], // Monday, 8 hours
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 2, // Max 2 bookings per day
					breakBetweenBookings: 0 // No break
				}
			});

			const slots = calculateAvailableSlots(availability, 60); // 1 hour slots

			// Group by day
			const slotsByDay = new Map<number, number>();
			for (const slot of slots) {
				const dayKey = Math.floor(slot.startTime / (24 * 60 * 60 * 1000));
				slotsByDay.set(dayKey, (slotsByDay.get(dayKey) || 0) + 1);
			}

			// Each day should have at most maxBookingsPerDay slots
			for (const count of slotsByDay.values()) {
				expect(count).toBeLessThanOrEqual(2);
			}
		});

		it('should respect break between bookings', () => {
			const availability = createMockAvailability({
				profileAvailability: {
					timeSlots: [{ day: 1, start: '09:00', end: '12:00' }], // 3 hours
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 10,
					breakBetweenBookings: 30 // 30 minute break
				}
			});

			const slots = calculateAvailableSlots(availability, 60); // 1 hour slots

			// Slots should have at least 30 minute break between them
			for (let i = 0; i < slots.length - 1; i++) {
				const breakDuration = slots[i + 1].startTime - slots[i].endTime;
				expect(breakDuration).toBeGreaterThanOrEqual(30 * 60 * 1000);
			}
		});

		it('should return empty array if no available slots', () => {
			const availability = createMockAvailability({
				profileAvailability: {
					timeSlots: [],
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			});

			const slots = calculateAvailableSlots(availability, 60);
			expect(slots).toEqual([]);
		});

		it('should filter out slots shorter than task duration', () => {
			const availability = createMockAvailability({
				profileAvailability: {
					timeSlots: [{ day: 1, start: '09:00', end: '09:30' }], // 30 minutes
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			});

			const slots = calculateAvailableSlots(availability, 60); // 1 hour duration
			expect(slots).toEqual([]); // No slots because time slot is too short
		});

		it('should handle overlapping blocked times', () => {
			const blockedStart = tomorrow + 2 * 24 * 60 * 60 * 1000;
			const blockedEnd = blockedStart + 4 * 60 * 60 * 1000; // 4 hours

			const availability = createMockAvailability({
				blockedTimes: [
					{
						startTime: blockedStart,
						endTime: blockedStart + 2 * 60 * 60 * 1000,
						taskId: 'blocked-1'
					},
					{
						startTime: blockedStart + 1 * 60 * 60 * 1000,
						endTime: blockedEnd,
						taskId: 'blocked-2'
					}
				]
			});

			const slots = calculateAvailableSlots(availability, 60);

			// No slots should overlap with either blocked time
			expect(
				slots.every(
					(slot) =>
						slot.endTime <= blockedStart ||
						slot.startTime >= blockedEnd
				)
			).toBe(true);
		});
	});

	describe('findSoonestAvailableSlot', () => {
		it('should return the soonest available slot', () => {
			const availability = createMockAvailability();
			const soonest = findSoonestAvailableSlot(availability, 60);

			expect(soonest).not.toBeNull();
			if (soonest) {
				expect(soonest.startTime).toBeGreaterThan(0);
				expect(soonest.endTime).toBeGreaterThan(soonest.startTime);
				expect(soonest.duration).toBe(60);
			}
		});

		it('should return null if no slots available', () => {
			const availability = createMockAvailability({
				profileAvailability: {
					timeSlots: [],
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			});

			const soonest = findSoonestAvailableSlot(availability, 60);
			expect(soonest).toBeNull();
		});

		it('should return slot that respects notice period', () => {
			const availability = createMockAvailability({
				profileAvailability: {
					timeSlots: [{ day: new Date(now).getDay(), start: '09:00', end: '17:00' }],
					timezone: 'UTC',
					noticeHours: 48,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			});

			const soonest = findSoonestAvailableSlot(availability, 60);
			expect(soonest).not.toBeNull();
			if (soonest) {
				const noticeMs = 48 * 60 * 60 * 1000;
				expect(soonest.startTime).toBeGreaterThanOrEqual(now + noticeMs);
			}
		});
	});

	describe('isTimeSlotAvailable', () => {
		it('should return true for available slot', () => {
			// Find next Monday
			const nextMonday = new Date(tomorrow);
			while (nextMonday.getDay() !== 1) {
				nextMonday.setDate(nextMonday.getDate() + 1);
			}
			nextMonday.setHours(10, 0, 0, 0); // 10:00 AM

			const availability = createMockAvailability();
			const startTime = nextMonday.getTime();
			const endTime = startTime + 60 * 60 * 1000; // 1 hour later

			const isAvailable = isTimeSlotAvailable(availability, startTime, endTime);
			expect(isAvailable).toBe(true);
		});

		it('should return false for slot outside task window', () => {
			const availability = createMockAvailability();
			const startTime = now - 24 * 60 * 60 * 1000; // Yesterday
			const endTime = startTime + 60 * 60 * 1000;

			const isAvailable = isTimeSlotAvailable(availability, startTime, endTime);
			expect(isAvailable).toBe(false);
		});

		it('should return false for slot that violates notice period', () => {
			const availability = createMockAvailability({
				profileAvailability: {
					timeSlots: [{ day: new Date(now).getDay(), start: '09:00', end: '17:00' }],
					timezone: 'UTC',
					noticeHours: 48,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			});

			const startTime = now + 24 * 60 * 60 * 1000; // Only 24 hours notice
			const endTime = startTime + 60 * 60 * 1000;

			const isAvailable = isTimeSlotAvailable(availability, startTime, endTime);
			expect(isAvailable).toBe(false);
		});

		it('should return false for slot that overlaps blocked time', () => {
			const blockedStart = tomorrow + 2 * 24 * 60 * 60 * 1000;
			const blockedEnd = blockedStart + 2 * 60 * 60 * 1000;

			const availability = createMockAvailability({
				blockedTimes: [
					{
						startTime: blockedStart,
						endTime: blockedEnd,
						taskId: 'blocked-task'
					}
				]
			});

			const startTime = blockedStart + 30 * 60 * 1000; // Overlaps with blocked time
			const endTime = startTime + 60 * 60 * 1000;

			const isAvailable = isTimeSlotAvailable(availability, startTime, endTime);
			expect(isAvailable).toBe(false);
		});

		it('should return false for slot not in profile time slots', () => {
			const availability = createMockAvailability({
				profileAvailability: {
					timeSlots: [{ day: 1, start: '09:00', end: '17:00' }], // Only Monday
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			});

			// Try a slot on Wednesday (day 3)
			const wednesday = new Date(tomorrow);
			while (wednesday.getDay() !== 3) {
				wednesday.setDate(wednesday.getDate() + 1);
			}
			wednesday.setHours(10, 0, 0, 0);
			const startTime = wednesday.getTime();
			const endTime = startTime + 60 * 60 * 1000;

			const isAvailable = isTimeSlotAvailable(availability, startTime, endTime);
			expect(isAvailable).toBe(false);
		});
	});
});

