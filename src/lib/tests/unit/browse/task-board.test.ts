import { describe, expect, it } from 'vitest';
import { isHomeRegionTask, isZeroPricedTask, prepareBrowseTasks } from '$lib/browse/task-board';
import type { Task } from '$lib/types/task.d';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: overrides.id ?? 'task-1',
		npub: overrides.npub ?? 'author-a',
		status: TaskStatusEnum.OPEN,
		title: overrides.title ?? 'Help',
		description: overrides.description ?? 'Details',
		taskType: TaskTypeEnum.IN_PERSON,
		budget: overrides.budget ?? { amount: 20, currency: 'USD', type: BudgetTypeEnum.FIXED },
		deadline: null,
		dateRange: null,
		pickupLocation: overrides.pickupLocation ?? null,
		dropOffLocation: null,
		skills: [],
		categories: [],
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
		...overrides
	};
}

describe('browse task board', () => {
	it('hides zero prices and repeated posts from the same author', () => {
		const rows = prepareBrowseTasks(
			[
				task({ id: 'free', budget: { amount: 0, currency: 'USD', type: BudgetTypeEnum.FIXED } }),
				task({ id: 'old', title: 'Paint', description: 'Walls', createdAt: 1 }),
				task({ id: 'new', title: 'Paint', description: 'Walls', createdAt: 5 }),
				task({
					id: 'other',
					npub: 'author-b',
					title: 'Paint',
					description: 'Walls',
					createdAt: 9
				})
			],
			{ allCountries: true }
		);
		expect(rows.map((row) => row.id)).toEqual(['other', 'new']);
		expect(
			isZeroPricedTask(task({ budget: { amount: 0, currency: 'USD', type: BudgetTypeEnum.FIXED } }))
		).toBe(true);
	});

	it('defaults to El Salvador and Latin America, nearest first', () => {
		const salvador = task({
			id: 'sv',
			title: 'Errands in San Salvador',
			pickupLocation: {
				displayName: 'San Salvador, El Salvador',
				latitude: 13.7,
				longitude: -89.2,
				zipCode: '',
				locationLoaded: true
			}
		});
		const mexico = task({
			id: 'mx',
			title: 'Help in Mexico City',
			createdAt: 50,
			pickupLocation: {
				displayName: 'Mexico City, Mexico',
				latitude: 19.4,
				longitude: -99.1,
				zipCode: '',
				locationLoaded: true
			}
		});
		const egypt = task({
			id: 'eg',
			title: 'Help in Cairo',
			pickupLocation: {
				displayName: 'Cairo, Egypt',
				latitude: 30.04,
				longitude: 31.24,
				zipCode: '',
				locationLoaded: true
			}
		});
		expect(isHomeRegionTask(egypt)).toBe(false);
		expect(
			prepareBrowseTasks([egypt, mexico, salvador], { allCountries: false }).map((row) => row.id)
		).toEqual(['sv', 'mx']);
		expect(
			prepareBrowseTasks([egypt, mexico, salvador], { allCountries: true }).map((row) => row.id)
		).toEqual(['sv', 'mx', 'eg']);
	});
});
