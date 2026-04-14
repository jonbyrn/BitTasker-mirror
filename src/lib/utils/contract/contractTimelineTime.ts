import { get } from 'svelte/store';
import { locale, t } from 'svelte-i18n';
import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';

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
