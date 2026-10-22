import { describe, expect, it } from 'vitest';
import {
	categoryEachKey,
	dedupeListingsByEvent,
	listingEventKey,
	selectVisibleTasks
} from '$lib/utils/listings/publicListings';

describe('public listings', () => {
	it('keeps the newest replaceable event and gives duplicate category strings unique keys', () => {
		const older = {
			id: 'task-1',
			npub: 'pub',
			kind: 30001,
			tags: [['d', 'same']],
			createdAt: 10,
			title: 'Clean the kitchen',
			status: 'OPEN',
			budget: { amount: 20 }
		};
		const newer = { ...older, id: 'task-2', createdAt: 20, title: 'Clean the kitchen again' };
		const visible = selectVisibleTasks([older, newer, { ...newer, id: '' }], '', false).visible;

		expect(visible).toHaveLength(1);
		expect(visible[0]?.id).toBe('task-2');
		expect(listingEventKey(older)).toBe(listingEventKey(newer));
		expect(dedupeListingsByEvent([older, newer])).toEqual([newer]);
		expect(categoryEachKey('cleaning', 0)).not.toBe(categoryEachKey('cleaning', 1));
	});
});
