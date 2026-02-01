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
			return formatted.replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi, 
				(match) => match.charAt(0).toUpperCase() + match.slice(1));
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
			return formatted.replace(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/gi, 
				(match) => match.charAt(0).toUpperCase() + match.slice(1));
		}
		
		return formatted;
	} catch (error) {
		console.error('Error formatting standard date short:', error);
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
				.replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi, 
					(match) => match.charAt(0).toUpperCase() + match.slice(1)) // Capitalize only month name
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
export function normalizeDeadlineToEndOfDay(date: Date | string | null | undefined): string | undefined {
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
 * Serialize a Date object to a string preserving local time (not UTC)
 * This is used when sending dates through JSON to preserve the user's selected time
 * Format: "YYYY-MM-DDTHH:mm:ss" (without timezone indicator)
 * @param date - The Date object to serialize
 * @returns ISO-like string with local time components (no timezone)
 */
export function serializeDateWithLocalTime(date: Date | null | undefined): string | null {
	if (!date) return null;
	
	// Extract local time components to preserve the user's selected time
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');
	
	// Return as "YYYY-MM-DDTHH:mm:ss" (no timezone, preserving local time)
	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
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
	console.warn('Could not parse date with local time format, falling back to standard parsing:', dateString);
	const parsed = new Date(dateString);
	return isNaN(parsed.getTime()) ? null : parsed;
}