import { describe, expect, it } from 'vitest';
import {
	formatTaskPrice,
	selectSharedTasks,
	taskPriceUsd
} from '$lib/browse/task-board';
import { listingCategory, openTaskCounts, tasksForTileCounts } from '$lib/search/category-counts';
import type { Task } from '$lib/types/task.d';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

function task(overrides: Partial<Task> & { amount?: number; currency?: string } = {}): Task {
	return {
		id: overrides.id ?? 'task-1',
		npub: overrides.npub ?? 'author-a',
		status: overrides.status ?? TaskStatusEnum.OPEN,
		title: overrides.title ?? 'Help',
		description: overrides.description ?? 'Details',
		taskType: TaskTypeEnum.IN_PERSON,
		budget: overrides.budget ?? {
			amount: overrides.amount ?? 20,
			currency: overrides.currency ?? 'USD',
			type: BudgetTypeEnum.FIXED
		},
		deadline: overrides.deadline === undefined ? '2099-01-01' : overrides.deadline,
		dateRange: null,
		pickupLocation: overrides.pickupLocation ?? null,
		dropOffLocation: null,
		skills: [],
		categories: overrides.categories ?? [],
		estimatedHours: 1,
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		createdAt: overrides.createdAt ?? 10,
		updatedAt: '',
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: [],
		attachments: []
	} as Task;
}

describe('shared open tasks', () => {
	it('gives browse, tiles, and category lists the same sofa', () => {
		const expiredDollar = task({
			id: 'sofa',
			title: 'Help move my sofa',
			description: 'Across the room',
			createdAt: 100,
			deadline: '2020-01-01',
			amount: 100_000,
			currency: 'SATS'
		});
		const live = task({
			id: 'sofa',
			title: 'Help move my sofa',
			description: 'Across the room',
			createdAt: 200,
			deadline: '2099-06-01',
			amount: 963_000,
			currency: 'SATS'
		});
		const expiredOnly = Array.from({ length: 10 }, (_, index) =>
			task({
				id: `old-${index}`,
				title: `Paint the hall ${index}`,
				createdAt: 40 - index,
				deadline: '2020-01-01',
				amount: 40
			})
		);
		const events = [expiredDollar, ...expiredOnly, live];
		const browse = selectSharedTasks(events);
		const tiles = tasksForTileCounts(events);
		const counts = openTaskCounts(events);
		const removalsOnBrowse = browse.filter(
			(row) => listingCategory(row)?.category === 'removals'
		);
		const removalsOnList = tiles.filter((row) => listingCategory(row)?.category === 'removals');

		expect(removalsOnBrowse.map((row) => row.id)).toEqual(removalsOnList.map((row) => row.id));
		expect(counts.removals).toBe(removalsOnBrowse.length);
		expect(counts.removals).toBe(1);
		expect(browse.filter((row) => row.id.startsWith('old-'))).toHaveLength(0);
		expect(formatTaskPrice(taskPriceUsd(removalsOnBrowse[0]))).toBe('$9.63');
		expect(formatTaskPrice(removalsOnList[0].budget?.amount ?? 0)).toBe('$9.63');
		expect(formatTaskPrice(taskPriceUsd(expiredDollar))).toBe('$1');
	});

	it('does not count a one-dollar sofa move as open', () => {
		const sofa = task({
			id: 'cheap-sofa',
			title: 'Help move my sofa',
			amount: 1,
			currency: 'USD'
		});
		expect(selectSharedTasks([sofa])).toHaveLength(0);
		expect(openTaskCounts([sofa]).removals ?? 0).toBe(0);
		expect(tasksForTileCounts([sofa])).toHaveLength(0);
	});
});
