export const MIN_BOOKED_HOURS = 1;
export const MAX_BOOKED_HOURS = 1000;

/** Whole hours a buyer can book. Empty or invalid input falls back to 1 hour. */
export function normalizeBookedHours(value: number | null | undefined): number {
	if (value == null || !Number.isFinite(value)) {
		return MIN_BOOKED_HOURS;
	}

	const wholeHours = Math.floor(value);
	if (wholeHours < MIN_BOOKED_HOURS) {
		return MIN_BOOKED_HOURS;
	}
	if (wholeHours > MAX_BOOKED_HOURS) {
		return MAX_BOOKED_HOURS;
	}

	return wholeHours;
}

/** Default the selector to the seller's estimate, or 1 hour when none is set. */
export function defaultBookedHours(estimatedHours: number | null | undefined): number {
	return normalizeBookedHours(estimatedHours);
}

/** $10/h booked for N hours is rate × hours. Add-ons and rush stay outside this total. */
export function hourlyBookingAmountUsd(hourlyRate: number, bookedHours: number): number {
	return hourlyRate * normalizeBookedHours(bookedHours);
}
