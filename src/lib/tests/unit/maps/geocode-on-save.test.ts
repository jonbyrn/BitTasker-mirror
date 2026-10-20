import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { resetNominatimForTests } from '$lib/utils/maps/nominatim';
import {
	geocodeServiceForSave,
	geocodeTaskForSave,
	hasPlaceOrCoordinates
} from '$lib/utils/maps/geocode-on-save';
import type { Location } from '$lib/types/task';

const hoisted = vi.hoisted(() => ({
	publishExactTaskLocations: vi.fn(),
	getExactTaskLocations: vi.fn(),
	publishExactServiceLocation: vi.fn(),
	getExactServiceLocation: vi.fn(),
	getSignedEvent: vi.fn(),
	publishEvent: vi.fn(),
	requestEvents: vi.fn(),
	getNpub: vi.fn()
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: (...args: unknown[]) => hoisted.getNpub(...args)
}));

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		publishEvent: (...args: unknown[]) => hoisted.publishEvent(...args),
		requestEvents: (...args: unknown[]) => hoisted.requestEvents(...args),
		findEventById: vi.fn()
	}
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: (...args: unknown[]) => hoisted.getSignedEvent(...args),
	publishToMultipleRelays: async (...args: unknown[]) => {
		await hoisted.publishEvent(...args);
		return [{ relay: 'wss://relay.test', success: true }];
	}
}));

vi.mock('$lib/nostr', () => ({
	calculatePOW: vi.fn().mockResolvedValue(['0', '0'])
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
	return { user: readable({ name: 'Owner', picture: '' }) };
});

vi.mock('$lib/stores/app.store', async () => {
	const { readable } = await import('svelte/store');
	return { appStore: readable({ relays: [], pool: {} }) };
});

vi.mock('$lib/stores/task.store', async () => {
	const { writable } = await import('svelte/store');
	return {
		tasksStore: writable({ items: [] }),
		myTasksStore: writable({ items: [] })
	};
});

vi.mock('$lib/nostr/findTasks', () => ({ cleanup: vi.fn() }));
vi.mock('$lib/nostr/findMyTasks', () => ({ cleanupMyTasks: vi.fn() }));

vi.mock('$lib/nostr/exact-location', () => ({
	publishExactTaskLocations: (...args: unknown[]) => hoisted.publishExactTaskLocations(...args),
	getExactTaskLocations: (...args: unknown[]) => hoisted.getExactTaskLocations(...args),
	publishExactServiceLocation: (...args: unknown[]) => hoisted.publishExactServiceLocation(...args),
	getExactServiceLocation: (...args: unknown[]) => hoisted.getExactServiceLocation(...args)
}));

function textPlace(displayName: string): Location {
	return {
		displayName,
		latitude: null,
		longitude: null,
		zipCode: '',
		locationLoaded: true
	};
}

function nominatimFetch(hits: Record<string, { lat: string; lon: string } | null>) {
	return vi.fn(async (input: RequestInfo | URL) => {
		const query = new URL(String(input)).searchParams.get('q') ?? '';
		const hit = hits[query];
		if (!hit) return new Response('[]', { status: 200 });
		return new Response(JSON.stringify([hit]), { status: 200 });
	});
}

afterEach(() => {
	resetNominatimForTests();
	vi.clearAllMocks();
});

describe('geocode listing coordinates at save', () => {
	it('keeps stored coordinates, including zero, and skips remote text', async () => {
		const fetchMock = vi.fn();
		resetNominatimForTests({ fetch: fetchMock as typeof fetch, intervalMs: 0 });

		const task = await geocodeTaskForSave({
			title: 'Equator sample',
			description: 'Stored coordinates stay put.',
			taskType: TaskTypeEnum.IN_PERSON,
			budget: { amount: 10, currency: 'USD', type: BudgetTypeEnum.FIXED },
			skills: [],
			categories: [],
			pickupLocation: {
				displayName: 'Gulf of Guinea',
				latitude: 0,
				longitude: 0,
				zipCode: '',
				locationLoaded: true
			},
			dropOffLocation: textPlace('Remote')
		});

		expect(task.pickupLocation?.latitude).toBe(0);
		expect(task.pickupLocation?.longitude).toBe(0);
		expect(task.dropOffLocation?.latitude).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(hasPlaceOrCoordinates(textPlace('Medellín, Colombia'))).toBe(true);
		expect(hasPlaceOrCoordinates(textPlace(''))).toBe(false);
	});

	it('fills task and service coordinates from place text and leaves a miss unchanged', async () => {
		const fetchMock = nominatimFetch({
			'Medellín, Colombia': { lat: '6.2442', lon: '-75.5812' },
			'Cali, Colombia': { lat: '3.4516', lon: '-76.5320' },
			Nowhereville: null
		});
		resetNominatimForTests({
			fetch: fetchMock as typeof fetch,
			intervalMs: 0,
			sleep: async () => undefined
		});

		const task = await geocodeTaskForSave({
			title: 'Move boxes',
			description: 'Two places.',
			taskType: TaskTypeEnum.IN_PERSON,
			budget: { amount: 20, currency: 'USD', type: BudgetTypeEnum.FIXED },
			skills: [],
			categories: [],
			pickupLocation: textPlace('Medellín, Colombia'),
			dropOffLocation: textPlace('Nowhereville')
		});
		const service = await geocodeServiceForSave({
			title: 'City photos',
			description: 'On location.',
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: {
				taskerLocation: { serviceLocation: textPlace('Cali, Colombia'), serviceRadius: 10 },
				taskeeLocation: {
					useGlobalLocation: false,
					locationDisplayName: 'Medellín, Colombia',
					serviceRadius: 5
				}
			},
			pricing: { type: ServicePricingTypeEnum.FIXED, currency: 'USD', amount: 40 },
			skills: ['Photo'],
			categories: [],
			status: 'active',
			uniqueId: '',
			createdAt: 0,
			creator: { username: 'Owner', avatar: '' }
		});

		expect(task.pickupLocation).toMatchObject({ latitude: 6.2442, longitude: -75.5812 });
		expect(task.dropOffLocation?.latitude).toBeNull();
		expect(service.locationDetails?.taskerLocation?.serviceLocation).toMatchObject({
			latitude: 3.4516,
			longitude: -76.532
		});
		expect(service.locationDetails?.taskeeLocation?.serviceLocation).toMatchObject({
			displayName: 'Medellín, Colombia',
			latitude: 6.2442,
			longitude: -75.5812
		});
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('publishes geocoded task coordinates and does not ask Nominatim again when coordinates already exist', async () => {
		const fetchMock = nominatimFetch({
			'Medellín, Colombia': { lat: '6.2442', lon: '-75.5812' }
		});
		resetNominatimForTests({
			fetch: fetchMock as typeof fetch,
			intervalMs: 0,
			sleep: async () => undefined
		});
		hoisted.getNpub.mockResolvedValue('a'.repeat(64));
		hoisted.getSignedEvent.mockImplementation(async (event: { content: string }) => ({
			...event,
			id: 'signed-task',
			pubkey: 'a'.repeat(64),
			sig: 'b'.repeat(128)
		}));
		hoisted.publishEvent.mockResolvedValue(undefined);
		hoisted.publishExactTaskLocations.mockResolvedValue(undefined);

		const { createTask, updateTask } = await import('$lib/nostr/task');
		await createTask({
			title: 'Assemble desk',
			description: 'Need help in Medellín.',
			taskType: TaskTypeEnum.IN_PERSON,
			budget: { amount: 50, currency: 'USD', type: BudgetTypeEnum.FIXED },
			skills: ['Assembly'],
			categories: [],
			status: TaskStatusEnum.OPEN,
			pickupLocation: textPlace('Medellín, Colombia')
		});

		const exact = hoisted.publishExactTaskLocations.mock.calls[0]?.[0] as {
			pickupLocation: Location;
		};
		const published = hoisted.publishEvent.mock.calls[0]?.[0] as {
			content: string;
			tags: string[][];
		};
		const content = JSON.parse(published.content) as { pickupLocation: Location };

		expect(exact.pickupLocation).toMatchObject({ latitude: 6.2442, longitude: -75.5812 });
		expect(content.pickupLocation.latitude).toBe(6.24);
		expect(content.pickupLocation.longitude).toBe(-75.58);
		expect(published.tags).toContainEqual(['L', 'Medellín, Colombia']);

		fetchMock.mockClear();
		hoisted.getExactTaskLocations.mockResolvedValue(null);
		hoisted.requestEvents.mockResolvedValue({
			data: [
				{
					id: 'e'.repeat(64),
					pubkey: 'a'.repeat(64),
					created_at: 1_700_000_000,
					kind: 30078,
					tags: [['d', 'assemble-desk']],
					content: JSON.stringify({
						title: 'Assemble desk',
						description: 'Need help in Medellín.',
						taskType: TaskTypeEnum.IN_PERSON,
						budget: { amount: 50, currency: 'USD', type: BudgetTypeEnum.FIXED },
						skills: ['Assembly'],
						categories: [],
						status: TaskStatusEnum.OPEN,
						pickupLocation: content.pickupLocation
					}),
					sig: ''
				}
			]
		});
		await updateTask('assemble-desk', { title: 'Assemble desk and shelves' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('geocodes an edited listing that still has place text and no coordinates', async () => {
		const fetchMock = nominatimFetch({
			'Cali, Colombia': { lat: '3.4516', lon: '-76.5320' }
		});
		resetNominatimForTests({
			fetch: fetchMock as typeof fetch,
			intervalMs: 0,
			sleep: async () => undefined
		});
		hoisted.getNpub.mockResolvedValue('a'.repeat(64));
		hoisted.getSignedEvent.mockImplementation(async (event: { content: string }) => ({
			...event,
			id: 'signed-update',
			pubkey: 'a'.repeat(64),
			sig: 'b'.repeat(128)
		}));
		hoisted.publishEvent.mockResolvedValue(undefined);
		hoisted.publishExactTaskLocations.mockResolvedValue(undefined);
		hoisted.getExactTaskLocations.mockResolvedValue(null);
		hoisted.requestEvents.mockResolvedValue({
			data: [
				{
					id: 'f'.repeat(64),
					pubkey: 'a'.repeat(64),
					created_at: 1_700_000_000,
					kind: 31000,
					tags: [['d', 'cali-task']],
					content: JSON.stringify({
						title: 'Old listing',
						description: 'Place text only.',
						taskType: TaskTypeEnum.IN_PERSON,
						budget: { amount: 20, currency: 'USD', type: BudgetTypeEnum.FIXED },
						skills: [],
						categories: [],
						status: TaskStatusEnum.OPEN,
						pickupLocation: textPlace('Cali, Colombia')
					}),
					sig: ''
				}
			]
		});

		const { updateTask } = await import('$lib/nostr/task');
		await updateTask('cali-task', { title: 'Old listing, edited' });

		const exact = hoisted.publishExactTaskLocations.mock.calls[0]?.[0] as {
			pickupLocation: Location;
		};
		const published = hoisted.publishEvent.mock.calls[0]?.[0] as { content: string };
		const content = JSON.parse(published.content) as { pickupLocation: Location };
		expect(exact.pickupLocation).toMatchObject({ latitude: 3.4516, longitude: -76.532 });
		expect(content.pickupLocation.latitude).toBe(3.45);
		expect(content.pickupLocation.longitude).toBe(-76.53);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
