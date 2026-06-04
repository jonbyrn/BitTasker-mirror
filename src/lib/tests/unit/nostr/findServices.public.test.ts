import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { nip19, type Event } from 'nostr-tools';
import { Preferences } from '@capacitor/preferences';
import { appStore } from '$lib/stores/app.store';
import { servicesStore } from '$lib/stores/service.store';
import KINDS from '$lib/utils/constants/kinds';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { StorageKeys } from '$lib/utils/constants/storage';
import nostrEventsService from '$lib/api/services/nostr/events';
import { fetchComprehensiveProfile } from '$lib/nostr/profile';
import { cleanup, findServices } from '$lib/nostr/findServices';

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		findEvents: vi.fn(),
		requestEvents: vi.fn()
	}
}));

vi.mock('$lib/nostr/profile', () => ({
	fetchComprehensiveProfile: vi.fn().mockResolvedValue(null)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn(() => new Promise(() => {}))
}));

function createServiceEvent(
	eventId: string,
	pubkey: string,
	uniqueId: string,
	overrides: { createdAt?: number; status?: 'active' | 'inactive' | 'sold' } = {}
): Event {
	return {
		id: eventId,
		pubkey,
		created_at: overrides.createdAt ?? 1_700_000_000,
		kind: KINDS.SERVICE_ACTIVE,
		tags: [['d', uniqueId]],
		content: JSON.stringify({
			uniqueId,
			status: overrides.status ?? 'active',
			title: `Service ${uniqueId}`,
			description: 'Service description',
			serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
			locationDetails: {},
			pricing: {
				type: ServicePricingTypeEnum.FIXED,
				amount: 125,
				currency: 'USD'
			},
			skills: ['Design'],
			categories: [{ id: 'design', name: 'Design', slug: 'design' }],
			createdAt: overrides.createdAt ?? 1_700_000_000,
			creator: {
				username: 'provider',
				avatar: ''
			}
		}),
		sig: 'f'.repeat(128)
	};
}

describe('findServices public discovery', () => {
	const mockFindEvents = vi.mocked(nostrEventsService.findEvents);
	const mockRequestEvents = vi.mocked(nostrEventsService.requestEvents);
	const mockFetchComprehensiveProfile = vi.mocked(fetchComprehensiveProfile);

	beforeEach(() => {
		vi.clearAllMocks();
		cleanup();
		appStore.resetUserState();
		servicesStore.update((state) => ({
			...state,
			items: [],
			loading: false,
			error: null
		}));
		mockRequestEvents.mockResolvedValue({ data: [] });
		vi.mocked(Preferences.get).mockResolvedValue({ value: null });
		mockFetchComprehensiveProfile.mockResolvedValue(null);
	});

	it('returns public services without requiring biometric npub resolution', async () => {
		mockFindEvents.mockResolvedValue({
			data: [createServiceEvent('a'.repeat(64), 'b'.repeat(64), 'featured-service-1')]
		});

		const result = await findServices({ page: 1, limit: 8 });

		expect(result.services).toHaveLength(1);
		expect(result.services[0].uniqueId).toBe('featured-service-1');
		expect(get(servicesStore).items).toHaveLength(1);
	});

	it('excludes the current user service when a cached npub is already in memory', async () => {
		const ownPubkey = '1'.repeat(64);
		const otherPubkey = '2'.repeat(64);

		appStore.update((state) => ({
			...state,
			nostrKeys: {
				...state.nostrKeys,
				npub: nip19.npubEncode(ownPubkey)
			}
		}));

		mockFindEvents.mockResolvedValue({
			data: [
				createServiceEvent('a'.repeat(64), ownPubkey, 'own-service'),
				createServiceEvent('b'.repeat(64), otherPubkey, 'public-service')
			]
		});

		const result = await findServices({ page: 1, limit: 8 });

		expect(result.services).toHaveLength(1);
		expect(result.services[0].uniqueId).toBe('public-service');
		expect(get(servicesStore).items.map((service) => service.uniqueId)).toEqual(['public-service']);
	});

	it('falls back to the stored npub cache before filtering own services', async () => {
		const ownPubkey = '3'.repeat(64);
		const otherPubkey = '4'.repeat(64);

		vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
			if (key === StorageKeys.NPUB) {
				return { value: nip19.npubEncode(ownPubkey) };
			}

			return { value: null };
		});

		mockFindEvents.mockResolvedValue({
			data: [
				createServiceEvent('c'.repeat(64), ownPubkey, 'stored-own-service'),
				createServiceEvent('d'.repeat(64), otherPubkey, 'stored-public-service')
			]
		});

		const result = await findServices({ page: 1, limit: 8 });

		expect(result.services).toHaveLength(1);
		expect(result.services[0].uniqueId).toBe('stored-public-service');
	});

	it('fails open when creator profile hydration never resolves', async () => {
		vi.useFakeTimers();
		try {
			mockFetchComprehensiveProfile.mockImplementation(() => new Promise(() => {}));
			mockFindEvents.mockResolvedValue({
				data: [createServiceEvent('e'.repeat(64), '5'.repeat(64), 'timeout-safe-service')]
			});

			const resultPromise = findServices({ page: 1, limit: 8 });
			await vi.advanceTimersByTimeAsync(800);
			const result = await resultPromise;

			expect(result.services).toHaveLength(1);
			expect(result.services[0].uniqueId).toBe('timeout-safe-service');
		} finally {
			vi.useRealTimers();
		}
	});

	it('hides a listing when the latest published version is inactive', async () => {
		mockFindEvents.mockResolvedValue({
			data: [
				createServiceEvent('a'.repeat(64), 'b'.repeat(64), 'stale-service', {
					createdAt: 1_700_000_000,
					status: 'active'
				}),
				createServiceEvent('c'.repeat(64), 'b'.repeat(64), 'stale-service', {
					createdAt: 1_700_000_100,
					status: 'inactive'
				})
			]
		});

		const result = await findServices({ page: 1, limit: 8 });

		expect(result.services).toHaveLength(0);
		expect(get(servicesStore).items).toHaveLength(0);
	});
});
