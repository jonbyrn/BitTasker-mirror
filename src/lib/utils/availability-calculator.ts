import type { AvailabilityResponse, CalculatedAvailableSlot } from '$lib/types/scheduling';
import type { TimeSlot } from '$lib/types/profile';
import { createDebouncedFunction } from './queue-performance';

/**
 * Client-side availability calculation utilities
 */

/**
 * Get all occurrences of a time slot within a date range
 * Returns array of { start, end } timestamps
 */
function getTimeSlotOccurrences(
	timeSlot: TimeSlot,
	dateRange: { start: number; end: number }
): Array<{ start: number; end: number }> {
	const [startHours, startMinutes] = timeSlot.start.split(':').map(Number);
	const [endHours, endMinutes] = timeSlot.end.split(':').map(Number);

	if (isNaN(startHours) || isNaN(startMinutes) || isNaN(endHours) || isNaN(endMinutes)) {
		return [];
	}

	const occurrences: Array<{ start: number; end: number }> = [];
	const startDate = new Date(dateRange.start);
	const endDate = new Date(dateRange.end);
	const currentDate = new Date(startDate);

	// Find first occurrence of this day of week
	const daysUntilTarget = (timeSlot.day - startDate.getDay() + 7) % 7;
	currentDate.setDate(startDate.getDate() + daysUntilTarget);
	currentDate.setHours(startHours, startMinutes, 0, 0);

	// Generate all occurrences within the date range
	while (currentDate <= endDate) {
		const slotStart = currentDate.getTime();

		// Create end time for this slot
		const slotEndDate = new Date(currentDate);
		slotEndDate.setHours(endHours, endMinutes, 0, 0);

		// Handle case where end time is next day (e.g., 22:00 - 02:00)
		if (slotEndDate <= currentDate) {
			slotEndDate.setDate(slotEndDate.getDate() + 1);
		}

		const slotEnd = slotEndDate.getTime();

		// Only add if it overlaps with the date range
		if (slotStart < dateRange.end && slotEnd > dateRange.start) {
			occurrences.push({
				start: Math.max(slotStart, dateRange.start),
				end: Math.min(slotEnd, dateRange.end)
			});
		}

		// Move to next week
		currentDate.setDate(currentDate.getDate() + 7);
	}

	return occurrences;
}

/**
 * Check if a time slot overlaps with any blocked times
 */
function isSlotBlocked(
	slotStart: number,
	slotEnd: number,
	blockedTimes: Array<{ startTime: number; endTime: number }>
): boolean {
	return blockedTimes.some(
		(blocked) => slotStart < blocked.endTime && slotEnd > blocked.startTime
	);
}

/**
 * Calculate available time slots from availability data
 */
export function calculateAvailableSlots(
	availabilityData: AvailabilityResponse,
	taskDurationMinutes: number
): CalculatedAvailableSlot[] {
	const { taskWindow, profileAvailability, blockedTimes } = availabilityData;
	const { timeSlots, timezone, noticeHours, maxBookingsPerDay, breakBetweenBookings } =
		profileAvailability;

	const availableSlots: CalculatedAvailableSlot[] = [];
	const now = Date.now();
	const noticeMs = noticeHours * 60 * 60 * 1000;

	// Group bookings by day to enforce maxBookingsPerDay
	const bookingsByDay = new Map<number, number>();

	// Process each time slot and generate all occurrences
	for (const timeSlot of timeSlots) {
		const occurrences = getTimeSlotOccurrences(timeSlot, taskWindow);

		for (const occurrence of occurrences) {
			const { start: slotStart, end: slotEnd } = occurrence;

			// Check notice period
			if (slotStart < now + noticeMs) continue;

			// Check if slot is long enough for task duration
			const slotDuration = slotEnd - slotStart;
			const taskDurationMs = taskDurationMinutes * 60 * 1000;
			if (slotDuration < taskDurationMs) continue;

			// Get day key for max bookings check
			const slotDate = new Date(slotStart);
			const dayKey = Math.floor(slotDate.getTime() / (24 * 60 * 60 * 1000));

			// Generate slots within this time slot occurrence
			let currentSlotStart = slotStart;
			const breakMs = breakBetweenBookings * 60 * 1000;

			while (currentSlotStart + taskDurationMs <= slotEnd) {
				const currentSlotEnd = currentSlotStart + taskDurationMs;

				// Check max bookings per day before adding slot
				const dayBookings = bookingsByDay.get(dayKey) || 0;
				if (dayBookings >= maxBookingsPerDay) {
					break; // Stop generating slots for this day
				}

				// Check if this slot overlaps with blocked times
				if (!isSlotBlocked(currentSlotStart, currentSlotEnd, blockedTimes)) {
					availableSlots.push({
						startTime: currentSlotStart,
						endTime: currentSlotEnd,
						duration: taskDurationMinutes
					});

					// Increment day bookings
					bookingsByDay.set(dayKey, (bookingsByDay.get(dayKey) || 0) + 1);
				}

				// Move to next slot (with break)
				currentSlotStart = currentSlotEnd + breakMs;
			}
		}
	}

	// Sort by start time
	return availableSlots.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Find the soonest available slot
 */
export function findSoonestAvailableSlot(
	availabilityData: AvailabilityResponse,
	taskDurationMinutes: number
): CalculatedAvailableSlot | null {
	const slots = calculateAvailableSlots(availabilityData, taskDurationMinutes);
	return slots.length > 0 ? slots[0] : null;
}

/**
 * Check if a specific time slot is available
 */
export function isTimeSlotAvailable(
	availabilityData: AvailabilityResponse,
	startTime: number,
	endTime: number
): boolean {
	const { taskWindow, profileAvailability, blockedTimes } = availabilityData;
	const { timeSlots, timezone, noticeHours } = profileAvailability;

	// Check if within task window
	if (startTime < taskWindow.start || endTime > taskWindow.end) {
		return false;
	}

	// Check notice period
	const now = Date.now();
	const noticeMs = noticeHours * 60 * 60 * 1000;
	if (startTime < now + noticeMs) {
		return false;
	}

	// Check if overlaps with blocked times
	if (isSlotBlocked(startTime, endTime, blockedTimes)) {
		return false;
	}

	// Check if falls within any profile time slot
	const startDate = new Date(startTime);
	const endDate = new Date(endTime);
	const dayOfWeek = startDate.getDay();
	const startTimeStr = `${startDate.getHours().toString().padStart(2, '0')}:${startDate
		.getMinutes()
		.toString()
		.padStart(2, '0')}`;
	const endTimeStr = `${endDate.getHours().toString().padStart(2, '0')}:${endDate
		.getMinutes()
		.toString()
		.padStart(2, '0')}`;

	// Find matching time slot for this day
	const matchingSlot = timeSlots.find((slot) => slot.day === dayOfWeek);

	if (!matchingSlot) {
		return false;
	}

	// Check if the requested time falls within the slot's time range
	// Handle case where slot spans midnight (e.g., 22:00 - 02:00)
	const slotStartTime = matchingSlot.start;
	const slotEndTime = matchingSlot.end;

	if (slotStartTime <= slotEndTime) {
		// Normal case: slot doesn't span midnight
		return startTimeStr >= slotStartTime && endTimeStr <= slotEndTime;
	} else {
		// Slot spans midnight: check if time is after start OR before end
		return startTimeStr >= slotStartTime || endTimeStr <= slotEndTime;
	}
}

