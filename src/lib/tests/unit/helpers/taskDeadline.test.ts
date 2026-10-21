import { describe, expect, it } from 'vitest';
import { isTaskDeadlineExpired } from '$lib/utils/helpers/taskDeadline';

describe('isTaskDeadlineExpired', () => {
	const now = new Date('2026-10-21T18:00:00.000Z');

	it('stays open through the deadline day', () => {
		expect(isTaskDeadlineExpired('2026-10-21T00:00:00.000Z', now)).toBe(false);
	});

	it('expires the day after the deadline', () => {
		expect(isTaskDeadlineExpired('2026-10-20T23:00:00.000Z', now)).toBe(true);
	});

	it('stays open when there is no deadline', () => {
		expect(isTaskDeadlineExpired(null, now)).toBe(false);
	});
});
