import { describe, expect, it } from 'vitest';
import {
	isHomeRegionTask,
	isJunkListing,
	isOutsideElSalvador,
	isZeroPricedTask,
	mentionsForeignListing,
	prepareBrowseTasks,
	shouldOfferExpired
} from '$lib/browse/task-board';
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

	it('defaults to El Salvador, nearest first', () => {
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
		expect(mentionsForeignListing(['Paint a wall for 12 euros', ''])).toBe(true);
		expect(
			isHomeRegionTask(
				task({ id: 'euro', title: 'Paint a wall for 12 euros', pickupLocation: null })
			)
		).toBe(false);
		expect(
			prepareBrowseTasks([egypt, mexico, salvador], { allCountries: false }).map((row) => row.id)
		).toEqual(['sv']);
		expect(
			prepareBrowseTasks([egypt, mexico, salvador], { allCountries: true }).map((row) => row.id)
		).toEqual(['sv', 'mx', 'eg']);
		expect(isOutsideElSalvador({ title: 'Errands', location: 'San Salvador, El Salvador' })).toBe(
			false
		);
		expect(isOutsideElSalvador({ title: 'Help', location: 'Mexico City, Mexico' })).toBe(true);
		expect(isOutsideElSalvador({ title: 'Remote website fix', location: '' })).toBe(false);
	});

	it('hides probe posts, ETH token tasks, and overseas tours', () => {
		const probe = task({ id: 'probe', title: 'relay probe', description: 'ignore' });
		const token = task({
			id: 'token',
			title: 'Develop DIRA token based on ETH network',
			pickupLocation: {
				displayName: 'San Salvador, El Salvador',
				latitude: 13.7,
				longitude: -89.2,
				zipCode: '',
				locationLoaded: true
			}
		});
		const tour = task({
			id: 'tour',
			title: 'Tour de escalada en Suesca',
			pickupLocation: {
				displayName: 'Suesca, Cundinamarca, Colombia',
				latitude: 5.1,
				longitude: -73.8,
				zipCode: '',
				locationLoaded: true
			}
		});
		const local = task({
			id: 'local',
			title: 'House cleaning',
			pickupLocation: {
				displayName: 'La Libertad, El Salvador',
				latitude: 13.4,
				longitude: -89.3,
				zipCode: '',
				locationLoaded: true
			}
		});
		expect(isJunkListing({ title: probe.title, description: probe.description })).toBe(true);
		expect(
			prepareBrowseTasks([probe, token, tour, local], { allCountries: true }).map((row) => row.id)
		).toEqual(['local']);
	});
});

describe('shouldOfferExpired', () => {
	it('keeps expired listings hidden until the visitor checks the box', () => {
		expect(shouldOfferExpired(0, 8, false, false)).toBe(false);
		expect(shouldOfferExpired(0, 8, true, true)).toBe(false);
		expect(shouldOfferExpired(2, 8, false, false)).toBe(false);
		expect(shouldOfferExpired(0, 0, false, false)).toBe(false);
	});
});
