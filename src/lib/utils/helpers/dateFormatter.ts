/**
 * Format a date to a readable string "Jul 17, 2025 12:00 PM"
 * @param date - The date to format
 * @returns Formatted date string in locale format
 */
export function formatDate(date: Date): string {
	try {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(date);
	} catch (error) {
		console.error('Error formatting date:', error);
		return 'Invalid date';
	}
}

/**
 * Format a date to the standard app format: "September 23, 2025"
 * This is the standard date display format used throughout the app
 * @param date - The date to format
 * @param locale - The locale to use for formatting (defaults to current locale)
 * @returns Formatted date string in standard app format
 */
export function formatStandardDate(date: Date, locale: string = 'en'): string {
	try {
		const formatted = new Intl.DateTimeFormat(locale, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		}).format(date);

		// For Spanish, capitalize only the month name, not connecting words like "de"
		if (locale === 'es') {
			return formatted.replace(
				/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi,
				(match) => match.charAt(0).toUpperCase() + match.slice(1)
			);
		}

		return formatted;
	} catch (error) {
		console.error('Error formatting standard date:', error);
		return 'Invalid date';
	}
}

/**
 * Format a date to the short month format: "Sept 23, 2025"
 * This is used for date ranges to keep them more compact
 * @param date - The date to format
 * @param locale - The locale to use for formatting (defaults to current locale)
 * @returns Formatted date string with short month
 */
export function formatStandardDateShort(date: Date, locale: string = 'en'): string {
	try {
		const formatted = new Intl.DateTimeFormat(locale, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		}).format(date);

		// For Spanish, capitalize only the month name, not connecting words like "de"
		if (locale === 'es') {
			return formatted.replace(
				/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/gi,
				(match) => match.charAt(0).toUpperCase() + match.slice(1)
			);
		}

		return formatted;
	} catch (error) {
		console.error('Error formatting standard date short:', error);
		return 'Invalid date';
	}
}

/**
 * Format a date with short month and time: "Feb 14, 2026 at 10:59 PM"
 * @param date - The date to format
 * @param locale - The locale to use for formatting (defaults to current locale)
 * @returns Formatted date string with short month and time
 */
export function formatStandardDateTimeShort(date: Date, locale: string = 'en'): string {
	try {
		const formatted = new Intl.DateTimeFormat(locale, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		}).format(date);

		// For Spanish, capitalize month and use AM/PM
		if (locale === 'es') {
			return formatted
				.replace(
					/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/gi,
					(m) => m.charAt(0).toUpperCase() + m.slice(1)
				)
				.replace(/a\.\s*m\./gi, 'AM')
				.replace(/p\.\s*m\./gi, 'PM');
		}

		return formatted;
	} catch (error) {
		console.error('Error formatting standard date time short:', error);
		return 'Invalid date';
	}
}

/**
 * Format a date to the standard app format with time: "September 23, 2025 at 2:30 PM"
 * @param date - The date to format
 * @param locale - The locale to use for formatting (defaults to current locale)
 * @returns Formatted date string with time in standard app format
 */
export function formatStandardDateTime(date: Date, locale: string = 'en'): string {
	try {
		const formatted = new Intl.DateTimeFormat(locale, {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		}).format(date);

		// For Spanish, capitalize only the month name and use AM/PM instead of a.m./p.m.
		if (locale === 'es') {
			return formatted
				.replace(
					/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi,
					(match) => match.charAt(0).toUpperCase() + match.slice(1)
				) // Capitalize only month name
				.replace(/a\.\s*m\./gi, 'AM') // Replace a.m. with AM
				.replace(/p\.\s*m\./gi, 'PM'); // Replace p.m. with PM
		}

		return formatted;
	} catch (error) {
		console.error('Error formatting standard date time:', error);
		return 'Invalid date';
	}
}

/**
 * Reactive date formatter that automatically uses the current locale from svelte-i18n
 * This should be used in Svelte components for reactive date formatting
 * @param date - The date to format
 * @param includeTime - Whether to include time in the format
 * @returns Reactive formatted date string
 */
export function createReactiveDateFormatter() {
	// This will be imported in components that need reactive date formatting
	return {
		formatStandardDate: (date: Date, locale: string) => formatStandardDate(date, locale),
		formatStandardDateTime: (date: Date, locale: string) => formatStandardDateTime(date, locale)
	};
}

export function formatTimeLarge(time: string): string {
	if (!time) return '';
	const [hours, minutes] = time.split(':');
	const date = new Date();
	date.setHours(+hours, +minutes);
	return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Format a time string from 24-hour format (HH:MM) to 12-hour format with AM/PM
 * @param time - Time string in HH:MM format (e.g., "09:00", "17:30")
 * @returns Formatted time string in 12-hour format (e.g., "9:00 AM", "5:30 PM")
 */
export function formatTime12Hour(time: string): string {
	if (!time) return '';

	try {
		const [hours, minutes] = time.split(':').map(Number);
		const date = new Date();
		date.setHours(hours, minutes, 0, 0);

		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	} catch (error) {
		console.error('Error formatting time:', error);
		return time; // Return original time if formatting fails
	}
}

/**
 * Convert a date to a relative time string (e.g., "2 days ago")
 * @param date - The date to format
 * @returns Relative time string
 */
export function timeAgo(date: Date): string {
	try {
		const now = new Date();
		const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

		if (isNaN(diffInSeconds)) {
			return 'Invalid date';
		}

		// Define time intervals
		const minute = 60;
		const hour = minute * 60;
		const day = hour * 24;
		const week = day * 7;
		const month = day * 30;
		const year = day * 365;

		// Calculate the appropriate time ago format
		if (diffInSeconds < minute) {
			return diffInSeconds === 1 ? '1 second ago' : `${diffInSeconds} seconds ago`;
		} else if (diffInSeconds < hour) {
			const minutes = Math.floor(diffInSeconds / minute);
			return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
		} else if (diffInSeconds < day) {
			const hours = Math.floor(diffInSeconds / hour);
			return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
		} else if (diffInSeconds < week) {
			const days = Math.floor(diffInSeconds / day);
			return days === 1 ? '1 day ago' : `${days} days ago`;
		} else if (diffInSeconds < month) {
			const weeks = Math.floor(diffInSeconds / week);
			return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
		} else if (diffInSeconds < year) {
			const months = Math.floor(diffInSeconds / month);
			return months === 1 ? '1 month ago' : `${months} months ago`;
		} else {
			const years = Math.floor(diffInSeconds / year);
			return years === 1 ? '1 year ago' : `${years} years ago`;
		}
	} catch (error) {
		console.error('Error calculating time ago:', error);
		return 'Unknown time ago';
	}
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Normalize a date to midnight UTC for the selected date
 * This prevents timezone shifts when storing dates (e.g., Nov 12 should stay Nov 12, not become Nov 11)
 * @param date - The date to normalize (can be Date object or ISO string or YYYY-MM-DD string)
 * @returns ISO string at midnight UTC for the selected date
 */
export function normalizeDateToUTC(date: Date | string | null | undefined): string | undefined {
	if (!date) return undefined;

	// If it's already a string in YYYY-MM-DD format, extract components directly
	if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
		const datePart = date.split('T')[0]; // Get YYYY-MM-DD part
		const parts = datePart.split('-');

		if (parts.length === 3) {
			const year = parseInt(parts[0], 10);
			const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed in Date.UTC
			const day = parseInt(parts[2], 10);

			if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
				// Create a new date at midnight UTC for the selected date
				const normalizedDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
				return normalizedDate.toISOString();
			}
		}
	}

	// For Date objects, extract local date components and create UTC date at midnight
	if (date instanceof Date) {
		// Extract year, month, and day from the date in local timezone
		// This ensures the user's selected date is preserved
		const year = date.getFullYear();
		const month = date.getMonth();
		const day = date.getDate();

		// Create a new date at midnight UTC for the selected date
		const normalizedDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
		return normalizedDate.toISOString();
	}

	// For ISO string formats, extract the date part and normalize
	if (typeof date === 'string') {
		const datePart = date.split('T')[0];
		const parts = datePart.split('-');

		if (parts.length === 3) {
			const year = parseInt(parts[0], 10);
			const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed in Date.UTC
			const day = parseInt(parts[2], 10);

			if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
				// Create a new date at midnight UTC for the selected date
				const normalizedDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
				return normalizedDate.toISOString();
			}
		}
	}

	console.error('Invalid date provided to normalizeDateToUTC:', date);
	return undefined;
}

/**
 * Normalize a deadline date to end of day (23:59:59.999Z) UTC for the selected date
 * This ensures that a deadline set for a specific date is valid for the entire day
 * and prevents timezone shifts when storing dates
 * @param date - The date to normalize (can be Date object or ISO string or YYYY-MM-DD string)
 * @returns ISO string at end of day UTC for the selected date
 */
export function normalizeDeadlineToEndOfDay(
	date: Date | string | null | undefined
): string | undefined {
	if (!date) return undefined;

	// If it's already a string in YYYY-MM-DD format, extract components directly
	if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
		const datePart = date.split('T')[0]; // Get YYYY-MM-DD part
		const parts = datePart.split('-');

		if (parts.length === 3) {
			const year = parseInt(parts[0], 10);
			const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed in Date.UTC
			const day = parseInt(parts[2], 10);

			if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
				// Create a new date at end of day UTC (23:59:59.999) for the selected date
				const normalizedDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
				return normalizedDate.toISOString();
			}
		}
	}

	// For Date objects, extract local date components and create UTC date at end of day
	if (date instanceof Date) {
		// Extract year, month, and day from the date in local timezone
		// This ensures the user's selected date is preserved
		const year = date.getFullYear();
		const month = date.getMonth();
		const day = date.getDate();

		// Create a new date at end of day UTC (23:59:59.999) for the selected date
		const normalizedDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
		return normalizedDate.toISOString();
	}

	// For ISO string formats, extract the date part and normalize
	if (typeof date === 'string') {
		const datePart = date.split('T')[0];
		const parts = datePart.split('-');

		if (parts.length === 3) {
			const year = parseInt(parts[0], 10);
			const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed in Date.UTC
			const day = parseInt(parts[2], 10);

			if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
				// Create a new date at end of day UTC (23:59:59.999) for the selected date
				const normalizedDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
				return normalizedDate.toISOString();
			}
		}
	}

	console.error('Invalid date provided to normalizeDeadlineToEndOfDay:', date);
	return undefined;
}

/**
 * Parse a date string and return a Date object normalized to local midnight
 * This is useful for displaying dates without timezone shifts
 * @param dateString - ISO date string (e.g., "2024-11-12T00:00:00.000Z")
 * @returns Date object at local midnight for the date
 */
export function parseDateToLocalMidnight(dateString: string | null | undefined): Date | null {
	if (!dateString) return null;

	// Extract date components directly from the ISO string to avoid timezone conversion issues
	// ISO format: "YYYY-MM-DDTHH:mm:ss.sssZ" or "YYYY-MM-DD"
	const datePart = dateString.split('T')[0]; // Get "YYYY-MM-DD" part
	const parts = datePart.split('-');

	if (parts.length === 3) {
		const year = parseInt(parts[0], 10);
		const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed in JavaScript Date
		const day = parseInt(parts[2], 10);

		// Validate the parsed values
		if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
			// Create a new date at local midnight to avoid timezone display issues
			return new Date(year, month, day, 0, 0, 0, 0);
		}
	}

	console.error('Invalid date string provided to parseDateToLocalMidnight:', dateString);
	return null;
}

/**
 * Convert a Date to Unix timestamp seconds (UTC).
 * Useful when storing instants that must be consistent across timezones.
 */
export function toUnixSeconds(date: Date | null | undefined): number | null {
	if (!date) return null;
	const ms = date.getTime();
	if (Number.isNaN(ms)) return null;
	return Math.floor(ms / 1000);
}

/**
 * Format the duration between two dates as human-readable text (e.g., "18 hours and 45 minutes").
 * @param start - Start date
 * @param end - End date
 * @param t - Translation function (e.g., $t from svelte-i18n) for day/day/hour/minutes
 * @returns Formatted duration string or empty if invalid
 */
export function formatDurationBetweenDates(
	start: Date,
	end: Date,
	t: (key: string) => string,
	keyPrefix: string = 'dashboard.bids.bid_creation'
): string {
	const diffMs = end.getTime() - start.getTime();
	if (diffMs <= 0) return '';

	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
	const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

	const tKey = (suffix: string) => {
		const key = `${keyPrefix}.${suffix}`;
		const translated = t(key);
		// Fallback to simple English if translation missing
		return translated === key ? suffix : translated;
	};

	const parts: string[] = [];
	if (diffDays > 0) {
		parts.push(`${diffDays} ${diffDays === 1 ? tKey('day') : tKey('days')}`);
	}
	if (diffHours > 0) {
		parts.push(`${diffHours} ${diffHours === 1 ? tKey('hour') : tKey('hours')}`);
	}
	if (diffMinutes > 0) {
		parts.push(`${diffMinutes} ${diffMinutes === 1 ? tKey('minute') : tKey('minutes')}`);
	}
	if (parts.length === 0) {
		return tKey('one_hour');
	}
	if (parts.length === 1) return parts[0];
	const lastPart = parts.pop()!;
	const conjunction = t('common.components.date_input.and');
	return `${parts.join(', ')} ${conjunction} ${lastPart}`;
}

/**
 * Parse a date string that was serialized with local time (no timezone)
 * This interprets the string as local time, not UTC
 * Format: "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DDTHH:mm" (without timezone indicator)
 * @param dateString - The date string to parse (should be in local time format)
 * @returns Date object representing the local time specified in the string
 */
export function parseDateWithLocalTime(dateString: string | null | undefined): Date | null {
	if (!dateString) return null;

	// Handle both "YYYY-MM-DDTHH:mm:ss" and "YYYY-MM-DDTHH:mm" formats
	const dateTimeMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);

	if (dateTimeMatch) {
		const year = parseInt(dateTimeMatch[1], 10);
		const month = parseInt(dateTimeMatch[2], 10) - 1; // Month is 0-indexed
		const day = parseInt(dateTimeMatch[3], 10);
		const hours = parseInt(dateTimeMatch[4], 10);
		const minutes = parseInt(dateTimeMatch[5], 10);
		const seconds = dateTimeMatch[6] ? parseInt(dateTimeMatch[6], 10) : 0;

		if (!isNaN(year) && !isNaN(month) && !isNaN(day) && !isNaN(hours) && !isNaN(minutes)) {
			// Create Date object using local time components (not UTC)
			// This preserves the time as the user selected it
			return new Date(year, month, day, hours, minutes, seconds, 0);
		}
	}

	// Fallback: try standard Date parsing (but this may cause timezone issues)
	console.warn(
		'Could not parse date with local time format, falling back to standard parsing:',
		dateString
	);
	const parsed = new Date(dateString);
	return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Coerce various timestamp inputs to Unix seconds.
 * - numbers: accepts seconds or milliseconds
 * - strings: accepts numeric seconds/milliseconds, ISO strings, or our legacy local-time format
 */
export function coerceUnixSeconds(value: unknown): number | null {
	if (value == null) return null;

	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return null;
		// If it's clearly milliseconds, convert to seconds.
		return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;

		// Numeric string: seconds or milliseconds
		if (/^\d+$/.test(trimmed)) {
			const num = Number(trimmed);
			if (!Number.isFinite(num)) return null;
			return num > 1_000_000_000_000 ? Math.floor(num / 1000) : Math.floor(num);
		}

		// ISO string with timezone indicator: use Date constructor directly (preserves UTC)
		if (/Z$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
			const isoParsed = new Date(trimmed);
			if (!Number.isNaN(isoParsed.getTime())) return Math.floor(isoParsed.getTime() / 1000);
			return null;
		}

		// Legacy local-time string ("YYYY-MM-DDTHH:mm:ss") — no timezone indicator.
		const localParsed = parseDateWithLocalTime(trimmed);
		if (localParsed) return Math.floor(localParsed.getTime() / 1000);

		const isoParsed = new Date(trimmed);
		if (!Number.isNaN(isoParsed.getTime())) return Math.floor(isoParsed.getTime() / 1000);

		return null;
	}

	return null;
}
