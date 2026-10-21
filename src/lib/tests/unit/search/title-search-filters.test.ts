import { describe, expect, it } from 'vitest';
import { filterIndexedTasks, indexTaskData } from '$lib/utils/task-indexing';
import { filterIndexedServices, indexServiceData } from '$lib/utils/service-indexing';
import {
	BudgetCurrencyEnum,
	BudgetTypeEnum,
	TaskStatusEnum,
	TaskTypeEnum
} from '$lib/utils/enums/task.enum';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

describe('exact title search ignores default category, location, and status filters', () => {
	it('keeps a task whose title matches even when category and location would exclude it', () => {
		const indexed = indexTaskData([
			{
				id: 'task-logo',
				title: 'Design a logo',
				description: 'One logo for a cafe.',
				taskType: TaskTypeEnum.REMOTE,
				status: TaskStatusEnum.OPEN,
				budget: {
					type: BudgetTypeEnum.FIXED,
					currency: BudgetCurrencyEnum.USDT,
					amount: 40
				},
				pickupLocation: {
					displayName: 'Austin, TX',
					latitude: 30.27,
					longitude: -97.74,
					locationLoaded: true
				},
				skills: [],
				categories: [{ id: 'design', name: 'Design' }]
			} as never
		]);

		const result = filterIndexedTasks(indexed, {
			search: 'Design a logo',
			categories: ['cleaning'],
			location: 'El Salvador',
			locationCoords: { latitude: 13.7, longitude: -89.2 },
			radius: 1.5
		} as never);

		expect(result.tasks.map((task) => task.id)).toEqual(['task-logo']);
	});

	it('still applies category and location when the user is browsing without a query', () => {
		const indexed = indexTaskData([
			{
				id: 'task-logo',
				title: 'Design a logo',
				description: 'One logo for a cafe.',
				taskType: TaskTypeEnum.REMOTE,
				status: TaskStatusEnum.OPEN,
				budget: {
					type: BudgetTypeEnum.FIXED,
					currency: BudgetCurrencyEnum.USDT,
					amount: 40
				},
				pickupLocation: {
					displayName: 'Austin, TX',
					latitude: 30.27,
					longitude: -97.74,
					locationLoaded: true
				},
				skills: [],
				categories: [{ id: 'design', name: 'Design' }]
			} as never
		]);

		const result = filterIndexedTasks(indexed, {
			search: '',
			categories: ['cleaning'],
			location: 'El Salvador',
			locationCoords: { latitude: 13.7, longitude: -89.2 },
			radius: 1.5
		} as never);

		expect(result.tasks).toHaveLength(0);
	});

	it('keeps a service whose title matches even when category, location, and status would exclude it', () => {
		const indexed = indexServiceData([
			{
				id: 'service-logo',
				uniqueId: 'service-logo',
				title: 'Design a logo',
				description: 'One logo for a cafe.',
				status: 'active',
				serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
				pricing: {
					type: ServicePricingTypeEnum.FIXED,
					amount: 40,
					currency: 'USD'
				},
				skills: [],
				categories: [{ id: 'design', name: 'Design' }]
			} as never
		]);

		const result = filterIndexedServices(indexed, {
			search: 'Design a logo',
			categories: ['cleaning'],
			status: ['inactive'],
			location: '13.7,-89.2',
			locationCoords: { latitude: 13.7, longitude: -89.2 },
			radius: 10
		} as never);

		expect(result.services.map((service) => service.id)).toEqual(['service-logo']);
	});
});
