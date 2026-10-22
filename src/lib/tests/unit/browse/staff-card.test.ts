import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { isTaskStaffId, staffMetaSegments } from '$lib/browse/staff-card';
import { load as loadShift } from '../../../../routes/(app)/shifts/[id]/+page';

describe('staff cards sourced from tasks', () => {
	it('sends task ids to the task page and leaves shift ids on the shift page', () => {
		expect(isTaskStaffId('task-bd032bc9-4c1e-4a1a-9c0a-1')).toBe(true);
		expect(isTaskStaffId('job-1')).toBe(false);

		try {
			loadShift({ params: { id: 'task-bd032bc9-4c1e-4a1a-9c0a-1' } });
			expect.fail('task ids should redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (isRedirect(error)) {
				expect(error.status).toBe(307);
				expect(error.location).toBe('/tasks/task-bd032bc9-4c1e-4a1a-9c0a-1');
			}
		}

		expect(loadShift({ params: { id: 'job-1' } })).toEqual({});
	});

	it('drops empty schedule fragments from the card line', () => {
		expect(staffMetaSegments(['Reception', '', 'El Panal, Santa Ana'])).toEqual([
			'Reception',
			'El Panal, Santa Ana'
		]);
		expect(staffMetaSegments(['Reception', '   ', 'El Panal, Santa Ana', '']).join(' · ')).toBe(
			'Reception · El Panal, Santa Ana'
		);
		expect(staffMetaSegments(['Reception', 'Mon 9–17', 'Santa Ana', '$12.00/hr']).join(' · ')).toBe(
			'Reception · Mon 9–17 · Santa Ana · $12.00/hr'
		);
	});
});
