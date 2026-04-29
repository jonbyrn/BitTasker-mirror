import { describe, expect, it } from 'vitest';
import { indexTaskData, filterIndexedTasks } from '$lib/utils/task-indexing';
import {
	TaskTypeEnum,
	TaskStatusEnum,
	BudgetTypeEnum,
	BudgetCurrencyEnum
} from '$lib/utils/enums/task.enum';

describe('task-indexing approximate public location compatibility', () => {
	it('matches text search against an approximate task location derived from existing location data', () => {
		const indexed = indexTaskData([
			{
				id: 'task-1',
				title: 'Pickup furniture',
				description: 'Move a desk across town.',
				taskType: TaskTypeEnum.IN_PERSON,
				status: TaskStatusEnum.OPEN,
				budget: {
					type: BudgetTypeEnum.FIXED,
					currency: BudgetCurrencyEnum.USDT,
					amount: 80
				},
				pickupLocation: {
					formattedAddress: '456 Pine St, Austin, TX, USA',
					addressComponents: {
						city: 'Austin',
						state: 'TX',
						country: 'USA'
					}
				},
				dropOffLocation: null,
				skills: [],
				categories: []
			} as never
		]);

		const result = filterIndexedTasks(indexed, {
			search: 'austin'
		} as never);

		expect(result.tasks).toHaveLength(1);
		expect(result.tasks[0]?.id).toBe('task-1');
	});

	it('keeps approximate public task matches inside the privacy tolerance buffer', () => {
		const indexed = indexTaskData([
			{
				id: 'task-buffered',
				title: 'Pickup furniture',
				description: 'Move a desk across town.',
				taskType: TaskTypeEnum.IN_PERSON,
				status: TaskStatusEnum.OPEN,
				budget: {
					type: BudgetTypeEnum.FIXED,
					currency: BudgetCurrencyEnum.USDT,
					amount: 80
				},
				pickupLocation: {
					displayName: 'Buffered task',
					latitude: 1.04851,
					longitude: 1,
					locationLoaded: true
				},
				dropOffLocation: null,
				skills: [],
				categories: []
			} as never
		]);

		const result = filterIndexedTasks(indexed, {
			location: 'origin',
			locationCoords: {
				latitude: 1,
				longitude: 1
			},
			radius: 5
		} as never);

		expect(result.tasks).toHaveLength(1);
		expect(result.tasks[0]?.id).toBe('task-buffered');
	});

	it('excludes approximate public task matches outside the privacy tolerance buffer', () => {
		const indexed = indexTaskData([
			{
				id: 'task-outside-buffer',
				title: 'Pickup furniture',
				description: 'Move a desk across town.',
				taskType: TaskTypeEnum.IN_PERSON,
				status: TaskStatusEnum.OPEN,
				budget: {
					type: BudgetTypeEnum.FIXED,
					currency: BudgetCurrencyEnum.USDT,
					amount: 80
				},
				pickupLocation: {
					displayName: 'Outside buffered task',
					latitude: 1.05031,
					longitude: 1,
					locationLoaded: true
				},
				dropOffLocation: null,
				skills: [],
				categories: []
			} as never
		]);

		const result = filterIndexedTasks(indexed, {
			location: 'origin',
			locationCoords: {
				latitude: 1,
				longitude: 1
			},
			radius: 5
		} as never);

		expect(result.tasks).toHaveLength(0);
	});

	it('treats zero latitude and longitude as valid task coordinates', () => {
		const indexed = indexTaskData([
			{
				id: 'task-zero',
				title: 'Meet at zero point',
				description: 'Pickup at the equator.',
				taskType: TaskTypeEnum.IN_PERSON,
				status: TaskStatusEnum.OPEN,
				budget: {
					type: BudgetTypeEnum.FIXED,
					currency: BudgetCurrencyEnum.USDT,
					amount: 80
				},
				pickupLocation: {
					displayName: 'Zero Point',
					latitude: 0,
					longitude: 0,
					locationLoaded: true
				},
				dropOffLocation: null,
				skills: [],
				categories: []
			} as never
		]);

		const result = filterIndexedTasks(indexed, {
			location: 'Zero Point',
			locationCoords: {
				latitude: 0,
				longitude: 0
			},
			radius: 1
		} as never);

		expect(result.tasks).toHaveLength(1);
		expect(result.tasks[0]?.id).toBe('task-zero');
	});
});
