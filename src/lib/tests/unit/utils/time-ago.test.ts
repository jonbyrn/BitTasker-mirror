import { describe, it, expect, vi, beforeEach } from 'vitest';
import { timeAgo } from '$lib/utils/timeAgo';

vi.mock('svelte-i18n', () => {
	const translations: Record<string, string> = {
		'notifications.just_now': 'Just now',
		'notifications.minutes_ago': '{count}m ago',
		'notifications.hours_ago': '{count}h ago',
		'notifications.days_ago': '{count}d ago',
		'notifications.weeks_ago': '{count}w ago',
		'notifications.months_ago': '{count}mo ago'
	};
	return {
		t: {
			subscribe: (fn: (t: (key: string, opts?: { values?: Record<string, number> }) => string) => void) => {
				const $t = (key: string, opts?: { values?: Record<string, number> }) => {
					let result = translations[key] ?? key;
					if (opts?.values) {
						for (const [k, v] of Object.entries(opts.values)) {
							result = result.replace(`{${k}}`, String(v));
						}
					}
					return result;
				};
				fn($t);
				return () => {};
			}
		}
	};
});

describe('timeAgo', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
	});

	it('returns "Just now" for timestamps less than 1 minute ago', () => {
		expect(timeAgo('2026-06-15T11:59:30Z')).toBe('Just now');
	});

	it('returns minutes ago for timestamps less than 1 hour ago', () => {
		expect(timeAgo('2026-06-15T11:55:00Z')).toBe('5m ago');
		expect(timeAgo('2026-06-15T11:01:00Z')).toBe('59m ago');
	});

	it('returns hours ago for timestamps less than 24 hours ago', () => {
		expect(timeAgo('2026-06-15T09:00:00Z')).toBe('3h ago');
		expect(timeAgo('2026-06-14T13:00:00Z')).toBe('23h ago');
	});

	it('returns days ago for timestamps less than 7 days ago', () => {
		expect(timeAgo('2026-06-13T12:00:00Z')).toBe('2d ago');
		expect(timeAgo('2026-06-09T12:00:00Z')).toBe('6d ago');
	});

	it('returns weeks ago for timestamps less than 4 weeks ago', () => {
		expect(timeAgo('2026-06-01T12:00:00Z')).toBe('2w ago');
		expect(timeAgo('2026-05-25T12:00:00Z')).toBe('3w ago');
	});

	it('returns months ago for timestamps 4+ weeks ago', () => {
		expect(timeAgo('2026-04-15T12:00:00Z')).toBe('2mo ago');
	});
});
