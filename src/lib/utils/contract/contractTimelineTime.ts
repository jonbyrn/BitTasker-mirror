import { get } from 'svelte/store';
import { locale, t } from 'svelte-i18n';
import { formatStandardDateTime, formatStandardDate } from '$lib/utils/helpers/dateFormatter';

/**
 * Format timestamp for timeline display - returns date only
 * e.g., "Feb 14, 2026"
 */
export function formatContractTimelineDate(timestampMs: number, loc: string): string {
	const date = new Date(timestampMs);
	return formatStandardDate(date, loc);
}

/**
 * Format timestamp for timeline display - returns time only
 * e.g., "10:59 PM"
 */
export function formatContractTimelineTime(timestampMs: number): string {
	const date = new Date(timestampMs);
	return date.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
}

/**
 * Relative / absolute label for a timeline row (uses current locale from stores).
 * Call from `$derived.by` after `get(locale)` and `get(t)` so updates stay reactive.
 */
export function formatContractTimelineTimeLabel(timestampMs: number): string {
	const date = new Date(timestampMs);
	const now = new Date();
	const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
	const translate = get(t);
	const loc = get(locale) || 'en';

	if (diffInHours < 1) {
		const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
		return diffInMinutes <= 1
			? translate('dashboard.contracts.timeline.just_now')
			: translate('dashboard.contracts.timeline.minutes_ago', {
					values: { minutes: diffInMinutes }
				});
	}
	if (diffInHours < 24) {
		const hours = Math.floor(diffInHours);
		return translate('dashboard.contracts.timeline.hours_ago', { values: { hours } });
	}
	return formatStandardDateTime(date, loc);
}
