import { derived } from 'svelte/store';
import { locale } from 'svelte-i18n';
import { formatStandardDate, formatStandardDateTime, formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';

/**
 * Create a reactive date formatter that automatically updates when locale changes
 * This should be used in Svelte components for reactive date formatting
 */
export function createReactiveDateFormatter() {
	// Create reactive stores that update when locale changes
	const currentLocale = derived(locale, ($locale) => $locale || 'en');
	
	return {
		/**
		 * Format a date using the current locale (reactive)
		 * @param date - The date to format
		 * @returns Reactive formatted date string
		 */
		formatDate: (date: Date) => {
			return derived(currentLocale, ($currentLocale) => {
				return formatStandardDate(date, $currentLocale);
			});
		},

		/**
		 * Format a date with time using the current locale (reactive)
		 * @param date - The date to format
		 * @returns Reactive formatted date string with time
		 */
		formatDateTime: (date: Date) => {
			return derived(currentLocale, ($currentLocale) => {
				return formatStandardDateTime(date, $currentLocale);
			});
		},

		/**
		 * Format a date range using the current locale with short month format (reactive)
		 * @param startDate - The start date
		 * @param endDate - The end date
		 * @returns Reactive formatted date range string
		 */
		formatDateRange: (startDate: Date, endDate: Date) => {
			return derived(currentLocale, ($currentLocale) => {
				const start = formatStandardDateShort(startDate, $currentLocale);
				const end = formatStandardDateShort(endDate, $currentLocale);
				return `${start} - ${end}`;
			});
		}
	};
}

// Legacy functions for backward compatibility (non-reactive)
export function getCurrentLocale(): string {
	let currentLocale = 'en';
	locale.subscribe(value => {
		currentLocale = value || 'en';
	})();
	return currentLocale;
}

export function formatDateWithCurrentLocale(date: Date): string {
	const currentLocale = getCurrentLocale();
	return formatStandardDate(date, currentLocale);
}

export function formatDateTimeWithCurrentLocale(date: Date): string {
	const currentLocale = getCurrentLocale();
	return formatStandardDateTime(date, currentLocale);
}

export function formatDateRangeWithCurrentLocale(startDate: Date, endDate: Date): string {
	const currentLocale = getCurrentLocale();
	const start = formatStandardDateShort(startDate, currentLocale);
	const end = formatStandardDateShort(endDate, currentLocale);
	return `${start} - ${end}`;
}

