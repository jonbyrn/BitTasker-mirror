/**
 * Format a date to a readable string
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
