import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import KINDS from '$lib/utils/constants/kinds';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

const TASK_AUTHOR_PUBKEY = 'a'.repeat(64);
const D_TAG = 'test-task-1700000000-abc123';

const hoisted = vi.hoisted(() => ({
	mockGetNpub: vi.fn(),
	mockPublishEvent: vi.fn(),
	mockRequestEvents: vi.fn(),
	mockGetSignedEvent: vi.fn(),
	mockCalculatePow: vi.fn(),
	mockPublishExactTaskLocations: vi.fn(),
	mockGetExactTaskLocations: vi.fn()
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: (...args: Parameters<typeof hoisted.mockGetNpub>) => hoisted.mockGetNpub(...args)
}));

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		requestEvents: (...args: Parameters<typeof hoisted.mockRequestEvents>) =>
			hoisted.mockRequestEvents(...args),
		findEventById: vi.fn(),
		publishEvent: (...args: Parameters<typeof hoisted.mockPublishEvent>) =>
			hoisted.mockPublishEvent(...args)
	}
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: (...args: Parameters<typeof hoisted.mockGetSignedEvent>) =>
		hoisted.mockGetSignedEvent(...args)
}));

vi.mock('$lib/nostr', () => ({
	calculatePOW: (...args: Parameters<typeof hoisted.mockCalculatePow>) =>
		hoisted.mockCalculatePow(...args)
}));

vi.mock('$lib/services/translation.service', () => ({
	TranslationService: class {
		isAvailable() {
			return false;
		}
	}
}));

vi.mock('$lib/stores/user.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		user: readable({
			name: 'Task owner',
			picture: ''
		})
	};
});

vi.mock('$lib/stores/app.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		appStore: readable({
			relays: [],
			pool: {}
		})
	};
});

vi.mock('$lib/stores/task.store', async () => {
	const { writable } = await import('svelte/store');
	return {
		tasksStore: writable({ items: [] }),
		myTasksStore: writable({ items: [] })
	};
});

vi.mock('$lib/nostr/findTasks', () => ({
	cleanup: vi.fn()
}));

vi.mock('$lib/nostr/findMyTasks', () => ({
	cleanupMyTasks: vi.fn()
}));

vi.mock('$lib/nostr/exact-location', () => ({
	publishExactTaskLocations: (...args: Parameters<typeof hoisted.mockPublishExactTaskLocations>) =>
		hoisted.mockPublishExactTaskLocations(...args),
	getExactTaskLocations: (...args: Parameters<typeof hoisted.mockGetExactTaskLocations>) =>
		hoisted.mockGetExactTaskLocations(...args)
}));

function createExactTaskLocation() {
	return {
		displayName: '1437 Wynkoop St, Denver, CO 80202, USA',
		latitude: 39.7527,
		longitude: -104.9982,
		zipCode: '80202',
		locationLoaded: true,
		formattedAddress: '1437 Wynkoop St, Denver, CO 80202, USA',
		placeId: 'place-123',
		addressComponents: {
			streetNumber: '1437',
			street: 'Wynkoop St',
			city: 'Denver',
			state: 'CO',
			country: 'US',
			postalCode: '80202'
		}
	};
}

function createTaskBody(overrides: Record<string, unknown> = {}) {
	return {
		title: 'Assemble standing desk',
		description: 'Need help assembling a desk in downtown Denver.',
		taskType: TaskTypeEnum.IN_PERSON,
		budget: {
			amount: 150,
			currency: 'USD',
			type: BudgetTypeEnum.FIXED
		},
		categories: [
			{
				id: 'assembly',
				name: 'Assembly',
				slug: 'assembly',
				description: 'Assembly tasks'
			}
		],
		skills: ['Assembly'],
		requiredSkills: [],
		pickupLocation: createExactTaskLocation(),
		status: TaskStatusEnum.OPEN,
		createdAt: 1_700_000_000,
		...overrides
	};
}

function createTaskEvent(overrides: Record<string, unknown> = {}) {
	return {
		id: 'e1' + '0'.repeat(62),
		pubkey: TASK_AUTHOR_PUBKEY,
		created_at: 1_700_000_000,
		kind: KINDS.TASK_CREATION,
		tags: [['d', D_TAG]],
		content: JSON.stringify(createTaskBody()),
		sig: '',
		...overrides
	};
}

describe('task publish location privacy', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.mockGetNpub.mockResolvedValue(TASK_AUTHOR_PUBKEY);
		hoisted.mockCalculatePow.mockResolvedValue(['0', '0']);
		hoisted.mockGetSignedEvent.mockImplementation(async (event) => ({
			...event,
			id: `signed-${hoisted.mockGetSignedEvent.mock.calls.length + 1}`,
			pubkey: TASK_AUTHOR_PUBKEY,
			sig: 'b'.repeat(128)
		}));
		hoisted.mockPublishEvent.mockResolvedValue(undefined);
		hoisted.mockPublishExactTaskLocations.mockResolvedValue(undefined);
		hoisted.mockGetExactTaskLocations.mockResolvedValue({
			pickupLocation: createExactTaskLocation(),
			dropOffLocation: null
		});
		hoisted.mockRequestEvents.mockResolvedValue({
			data: [createTaskEvent()]
		});
	});

	it('publishes an approximate public task location while preserving the public schema and attempting an exact companion publish', async () => {
		const { createTask } = await import('$lib/nostr/task');
		await createTask(createTaskBody());

		expect(hoisted.mockPublishExactTaskLocations).toHaveBeenCalledTimes(1);
		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);

		const publicEvent = hoisted.mockPublishEvent.mock.calls[0]?.[0] as {
			kind: number;
			content: string;
			tags: string[][];
		};
		const publicContent = JSON.parse(publicEvent.content);

		expect(publicEvent.kind).toBe(KINDS.TASK_CREATION);

		expect(publicContent).toEqual(
			expect.objectContaining({
				pickupLocation: expect.objectContaining({
					displayName: 'Denver, CO, US',
					latitude: expect.any(Number),
					longitude: expect.any(Number),
					zipCode: '',
					locationLoaded: true
				})
			})
		);
		expect(publicContent).not.toHaveProperty('exactPickupLocation');
		expect(publicContent.pickupLocation.formattedAddress).not.toBe(
			createExactTaskLocation().formattedAddress
		);
		expect(publicContent.pickupLocation.placeId).not.toBe(createExactTaskLocation().placeId);
		expect(publicEvent.tags).toContainEqual(['L', 'Denver, CO, US']);
	});

	it('fails closed when publishing the exact task companion fails during create', async () => {
		hoisted.mockPublishExactTaskLocations.mockRejectedValueOnce(
			new Error('exact companion publish failed')
		);

		const { createTask } = await import('$lib/nostr/task');

		await expect(createTask(createTaskBody())).rejects.toThrow('exact companion publish failed');
		expect(hoisted.mockPublishEvent).not.toHaveBeenCalled();
	});

	it('keeps the public task schema stable on update when the exact location is unchanged and still attempts the exact companion publish', async () => {
		const { updateTask } = await import('$lib/nostr/task');
		await updateTask(D_TAG, {
			title: 'Assemble standing desk and shelves'
		});

		expect(hoisted.mockPublishExactTaskLocations).toHaveBeenCalledTimes(1);
		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);

		const publicEvent = hoisted.mockPublishEvent.mock.calls[0]?.[0] as {
			kind: number;
			content: string;
			tags: string[][];
		};
		const publicContent = JSON.parse(publicEvent.content);

		expect(publicEvent.kind).toBe(KINDS.TASK_CREATION);

		expect(publicContent).toEqual(
			expect.objectContaining({
				pickupLocation: expect.objectContaining({
					displayName: 'Denver, CO, US',
					latitude: expect.any(Number),
					longitude: expect.any(Number),
					zipCode: '',
					locationLoaded: true
				})
			})
		);
		expect(publicContent.pickupLocation.formattedAddress).not.toBe(
			createExactTaskLocation().formattedAddress
		);
		expect(publicContent.pickupLocation.placeId).not.toBe(createExactTaskLocation().placeId);
		expect(publicEvent.tags).toContainEqual(['L', 'Denver, CO, US']);
	});

	it('fails closed when publishing the exact task companion fails during update', async () => {
		hoisted.mockPublishExactTaskLocations.mockRejectedValueOnce(
			new Error('exact companion publish failed')
		);

		const { updateTask } = await import('$lib/nostr/task');

		await expect(
			updateTask(D_TAG, {
				title: 'Assemble standing desk and shelves'
			})
		).rejects.toThrow('exact companion publish failed');
		expect(hoisted.mockPublishEvent).not.toHaveBeenCalled();
	});

	it('does not overwrite the exact companion with public approximate coordinates when an update cannot load the companion event', async () => {
		hoisted.mockGetExactTaskLocations.mockResolvedValueOnce(null);

		const { updateTask } = await import('$lib/nostr/task');
		await updateTask(D_TAG, {
			title: 'Assemble standing desk and shelves'
		});

		expect(hoisted.mockPublishExactTaskLocations).not.toHaveBeenCalled();
		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);
	});

	it('keeps publishing the public update when the exact task companion read throws', async () => {
		hoisted.mockGetExactTaskLocations.mockRejectedValueOnce(new Error('read failed'));

		const { updateTask } = await import('$lib/nostr/task');
		await updateTask(D_TAG, {
			title: 'Assemble standing desk and shelves'
		});

		expect(hoisted.mockPublishExactTaskLocations).not.toHaveBeenCalled();
		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);
	});

	it('preserves exact owner-side task locations in the writable stores after a public update', async () => {
		const exactPickup = createExactTaskLocation();
		const { tasksStore, myTasksStore } = await import('$lib/stores/task.store');
		tasksStore.set({
			items: [
				{
					...createTaskBody(),
					pickupLocation: exactPickup,
					id: D_TAG,

					npub: TASK_AUTHOR_PUBKEY
				}
			]
		} as unknown as Parameters<typeof tasksStore.set>[0]);
		myTasksStore.set({
			items: [
				{
					...createTaskBody(),
					pickupLocation: exactPickup,
					id: D_TAG,

					npub: TASK_AUTHOR_PUBKEY
				}
			]
		} as unknown as Parameters<typeof myTasksStore.set>[0]);

		const { updateTask } = await import('$lib/nostr/task');
		await updateTask(D_TAG, {
			title: 'Assemble standing desk and shelves'
		});

		expect(get(tasksStore).items[0]?.pickupLocation?.formattedAddress).toBe(
			exactPickup.formattedAddress
		);
		expect(get(myTasksStore).items[0]?.pickupLocation?.formattedAddress).toBe(
			exactPickup.formattedAddress
		);
	});
});
