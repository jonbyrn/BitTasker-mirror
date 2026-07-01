import { get } from 'svelte/store';
import { t } from 'svelte-i18n';

/**
 * Format a date string as a human-readable relative time (e.g., "5m ago").
 * Uses svelte-i18n for localized strings. Updates are driven by the
 * caller (NotificationCard sets a 60s interval to re-call this).
 */
export function timeAgo(dateStr: string): string {
	const now = Date.now();
	const then = new Date(dateStr).getTime();
	const diffMs = now - then;
	const diffMin = Math.floor(diffMs / 60000);
	const diffHr = Math.floor(diffMs / 3600000);
	const diffDay = Math.floor(diffMs / 86400000);
	const diffWeek = Math.floor(diffMs / 604800000);
	const diffMonth = Math.floor(diffMs / 2592000000);

	const $t = get(t);

	if (diffMin < 1) return $t('notifications.just_now');
	if (diffMin < 60) return $t('notifications.minutes_ago', { values: { count: diffMin } });
	if (diffHr < 24) return $t('notifications.hours_ago', { values: { count: diffHr } });
	if (diffDay < 7) return $t('notifications.days_ago', { values: { count: diffDay } });
	if (diffWeek < 4) return $t('notifications.weeks_ago', { values: { count: diffWeek } });
	return $t('notifications.months_ago', { values: { count: diffMonth } });
}
