import { describe, expect, it } from 'vitest';
import { clearFlexibleDates } from '$lib/utils/helpers/task-schedule';

describe('clearFlexibleDates', () => {
	it('drops an invented window when the poster is flexible', () => {
		const next = clearFlexibleDates({
			title: 'Paint',
			flexibleSchedule: true,
			deadline: '2026-10-24T23:59:59.999Z',
			dateRange: { start: '2026-10-21T00:00:00.000Z', end: '2026-10-24T00:00:00.000Z' }
		});

		expect(next.flexibleSchedule).toBe(true);
		expect(next.dateRange).toBeUndefined();
		expect(next.deadline).toBeUndefined();
		expect(next.title).toBe('Paint');
	});
});
