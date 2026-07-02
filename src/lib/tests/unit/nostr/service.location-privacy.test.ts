import { beforeEach, describe, expect, it, vi } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const SERVICE_AUTHOR_PUBKEY = 'a'.repeat(64);
const SERVICE_D_TAG = 'service-logo-sprint-1700000000-aaaaaa';

const hoisted = vi.hoisted(() => ({
	mockGetNpub: vi.fn(),
	mockPublishEvent: vi.fn(),
	mockRequestEvents: vi.fn(),
	mockGetSignedEvent: vi.fn(),
	mockPublishExactServiceLocation: vi.fn(),
	mockGetExactServiceLocation: vi.fn()
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: (...args: Parameters<typeof hoisted.mockGetSignedEvent>) =>
		hoisted.mockGetSignedEvent(...args)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: (...args: Parameters<typeof hoisted.mockGetNpub>) => hoisted.mockGetNpub(...args)
}));

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		publishEvent: (...args: Parameters<typeof hoisted.mockPublishEvent>) =>
			hoisted.mockPublishEvent(...args),
		requestEvents: (...args: Parameters<typeof hoisted.mockRequestEvents>) =>
			hoisted.mockRequestEvents(...args)
	}
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
			name: 'Provider',
			picture: ''
		})
	};
});

vi.mock('$lib/nostr/exact-location', () => ({
	publishExactServiceLocation: (
		...args: Parameters<typeof hoisted.mockPublishExactServiceLocation>
	) => hoisted.mockPublishExactServiceLocation(...args),
	getExactServiceLocation: (...args: Parameters<typeof hoisted.mockGetExactServiceLocation>) =>
		hoisted.mockGetExactServiceLocation(...args)
}));

function createExactServiceLocation() {
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

function createServiceBody(overrides: Record<string, unknown> = {}) {
	return {
		title: 'Logo Sprint',
		description: 'Brand identity package with fast turnaround.',
		serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
		locationDetails: {
			taskeeLocation: {
				useGlobalLocation: false,
				serviceLocation: createExactServiceLocation(),
				locationDisplayName: createExactServiceLocation().displayName,
				serviceRadius: 5
			}
		},
		pricing: {
			type: ServicePricingTypeEnum.FIXED,
			currency: 'USDt',
			amount: 125,
			deliveryTime: {
				min: 2,
				max: 3,
				unit: 'day',
				display: '2-3 days'
			}
		},
		categories: [{ id: 'design', name: 'Design', slug: 'design' }],
		skills: ['Branding'],
		portfolio: [],
		faqs: [],
		status: 'active' as const,
		createdAt: 1_700_000_000,
		creator: {
			username: 'Provider',
			avatar: ''
		},
		...overrides
	};
}

function createServiceEvent() {
	return {
		id: 'service-event-1',
		pubkey: SERVICE_AUTHOR_PUBKEY,
		created_at: 1_700_000_000,
		kind: KINDS.SERVICE_ACTIVE,
		tags: [['d', SERVICE_D_TAG]],
		content: JSON.stringify({
			...createServiceBody(),
			uniqueId: SERVICE_D_TAG
		})
	};
}

describe('service publish location privacy', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.mockGetNpub.mockResolvedValue(SERVICE_AUTHOR_PUBKEY);
		hoisted.mockGetSignedEvent.mockImplementation(async (event) => ({
			...event,
			id: `signed-${hoisted.mockGetSignedEvent.mock.calls.length + 1}`,
			pubkey: SERVICE_AUTHOR_PUBKEY,
			sig: 'b'.repeat(128)
		}));
		hoisted.mockPublishEvent.mockResolvedValue(undefined);
		hoisted.mockPublishExactServiceLocation.mockResolvedValue(undefined);
		hoisted.mockGetExactServiceLocation.mockResolvedValue({
			taskeeLocation: createExactServiceLocation()
		});
		hoisted.mockRequestEvents.mockResolvedValue({
			data: [createServiceEvent()]
		});
	});

	it('publishes an approximate public service location while preserving the public schema and attempting an exact companion publish', async () => {
		const { createService } = await import('$lib/nostr/service');
		await createService(
			createServiceBody() as unknown as import('$lib/types/service.d').ServiceBody
		);

		expect(hoisted.mockPublishExactServiceLocation).toHaveBeenCalledTimes(1);
		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);

		const publicEvent = hoisted.mockPublishEvent.mock.calls[0]?.[0] as {
			kind: number;
			content: string;
			tags: string[][];
		};
		const publicContent = JSON.parse(publicEvent.content);

		expect(publicEvent.kind).toBe(KINDS.SERVICE_ACTIVE);

		expect(publicContent).toEqual(
			expect.objectContaining({
				locationDetails: expect.objectContaining({
					taskeeLocation: expect.objectContaining({
						serviceLocation: expect.objectContaining({
							displayName: 'Denver, CO, US',
							latitude: expect.any(Number),
							longitude: expect.any(Number),
							zipCode: '',
							locationLoaded: true
						})
					})
				})
			})
		);
		expect(publicContent).not.toHaveProperty('exactLocationDetails');
		expect(publicContent.locationDetails.taskeeLocation.serviceLocation.formattedAddress).not.toBe(
			createExactServiceLocation().formattedAddress
		);
		expect(publicContent.locationDetails.taskeeLocation.serviceLocation.placeId).not.toBe(
			createExactServiceLocation().placeId
		);
		expect(publicEvent.tags).toContainEqual(['location', 'Denver, CO, US']);
		expect(publicEvent.tags).toContainEqual(['location_display_name', 'Denver, CO, US']);
	}, 10_000);

	it('fails closed when publishing the exact service companion fails during create', async () => {
		hoisted.mockPublishExactServiceLocation.mockRejectedValueOnce(
			new Error('exact companion publish failed')
		);

		const { createService } = await import('$lib/nostr/service');

		await expect(
			createService(createServiceBody() as unknown as import('$lib/types/service.d').ServiceBody)
		).rejects.toThrow('exact companion publish failed');
		expect(hoisted.mockPublishEvent).not.toHaveBeenCalled();
	});

	it('keeps the public service schema stable on update when the exact location is unchanged and still attempts the exact companion publish', async () => {
		const { updateService } = await import('$lib/nostr/service');
		await updateService(SERVICE_D_TAG, {
			title: 'Logo Sprint Deluxe'
		});

		expect(hoisted.mockPublishExactServiceLocation).toHaveBeenCalledTimes(1);
		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);

		const publicEvent = hoisted.mockPublishEvent.mock.calls[0]?.[0] as {
			kind: number;
			content: string;
			tags: string[][];
		};
		const publicContent = JSON.parse(publicEvent.content);

		expect(publicEvent.kind).toBe(KINDS.SERVICE_ACTIVE);

		expect(publicContent).toEqual(
			expect.objectContaining({
				locationDetails: expect.objectContaining({
					taskeeLocation: expect.objectContaining({
						serviceLocation: expect.objectContaining({
							displayName: 'Denver, CO, US',
							latitude: expect.any(Number),
							longitude: expect.any(Number),
							zipCode: '',
							locationLoaded: true
						})
					})
				})
			})
		);
		expect(publicContent.locationDetails.taskeeLocation.serviceLocation.formattedAddress).not.toBe(
			createExactServiceLocation().formattedAddress
		);
		expect(publicContent.locationDetails.taskeeLocation.serviceLocation.placeId).not.toBe(
			createExactServiceLocation().placeId
		);
		expect(publicEvent.tags).toContainEqual(['location', 'Denver, CO, US']);
		expect(publicEvent.tags).toContainEqual(['location_display_name', 'Denver, CO, US']);
	}, 10_000);

	it('fails closed when publishing the exact service companion fails during update', async () => {
		hoisted.mockPublishExactServiceLocation.mockRejectedValueOnce(
			new Error('exact companion publish failed')
		);

		const { updateService } = await import('$lib/nostr/service');

		await expect(
			updateService(SERVICE_D_TAG, {
				title: 'Logo Sprint Deluxe'
			})
		).rejects.toThrow('exact companion publish failed');
		expect(hoisted.mockPublishEvent).not.toHaveBeenCalled();
	});

	it('does not overwrite the exact service companion with public approximate coordinates when an update cannot load the companion event', async () => {
		hoisted.mockGetExactServiceLocation.mockResolvedValueOnce(null);

		const { updateService } = await import('$lib/nostr/service');
		await updateService(SERVICE_D_TAG, {
			title: 'Logo Sprint Deluxe'
		});

		expect(hoisted.mockPublishExactServiceLocation).not.toHaveBeenCalled();
		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);
	});

	it('keeps publishing the public update when the exact service companion read throws', async () => {
		hoisted.mockGetExactServiceLocation.mockRejectedValueOnce(new Error('read failed'));

		const { updateService } = await import('$lib/nostr/service');
		await updateService(SERVICE_D_TAG, {
			title: 'Logo Sprint Deluxe'
		});

		expect(hoisted.mockPublishExactServiceLocation).not.toHaveBeenCalled();
		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);
	});
});
