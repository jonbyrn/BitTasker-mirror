import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, findServices, invalidateServiceDiscoveryCaches } from '$lib/nostr/findServices';
import { servicesStore } from '$lib/stores/service.store';
import KINDS from '$lib/utils/constants/kinds';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import nostrEventsService from '$lib/api/services/nostr/events';
import { fetchComprehensiveProfile } from '$lib/utils/nostr-message';

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		findEvents: vi.fn(),
		requestEvents: vi.fn()
	}
}));

vi.mock('$lib/utils/nostr-message', () => ({
	fetchComprehensiveProfile: vi.fn().mockResolvedValue(null)
}));

function createServiceEvent(
	eventId: string,
	pubkey: string,
	uniqueId: string,
	overrides: { createdAt?: number; status?: 'active' | 'inactive' | 'sold' } = {}
): import('nostr-tools').Event {
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
			pricing: { type: ServicePricingTypeEnum.FIXED, amount: 125, currency: 'USD' },
			skills: ['Design'],
			categories: [{ id: 'design', name: 'Design', slug: 'design' }],
			createdAt: overrides.createdAt ?? 1_700_000_000,
			creator: { username: 'provider', avatar: '' }
		}),
		sig: 'f'.repeat(128)
	};
}

describe('findServices performance fixes', () => {
	const mockFindEvents = vi.mocked(nostrEventsService.findEvents);
	const mockRequestEvents = vi.mocked(nostrEventsService.requestEvents);

	beforeEach(() => {
		vi.clearAllMocks();
		cleanup();
		servicesStore.update((state) => ({ ...state, items: [], loading: false, error: null }));
		mockRequestEvents.mockResolvedValue({ data: [] });
		vi.mocked(fetchComprehensiveProfile).mockResolvedValue(null);
	});

	describe('deletionCache bounded size', () => {
		it('should only call requestEvents for deletions once regardless of search terms', async () => {
			let deleteCallCount = 0;
			mockRequestEvents.mockImplementation(async () => {
				deleteCallCount++;
				return { data: [] };
			});

			mockFindEvents.mockResolvedValue({
				data: [createServiceEvent('a'.repeat(64), 'b'.repeat(64), 'service-1')]
			});

			await findServices({ page: 1, limit: 8 });
			await findServices({ page: 1, limit: 8, search: 'term1' });
			await findServices({ page: 1, limit: 8, search: 'term2' });
			await findServices({ page: 1, limit: 8, search: 'term3' });
			await findServices({ page: 1, limit: 8, search: 'term4' });
			await findServices({ page: 1, limit: 8, search: 'term5' });
			await findServices({ page: 1, limit: 8, search: 'term6' });

			expect(deleteCallCount).toBe(1);
		});
	});

	describe('profile fetch deduplication', () => {
		it('should only fetch profile once for same pubkey even with multiple services', async () => {
			const pubkey = 'a'.repeat(64);
			let resolveProfile: (value: unknown) => void;
			const profilePromise = new Promise((resolve) => {
				resolveProfile = resolve;
			});
			
			const profileCalls: string[] = [];
			vi.mocked(fetchComprehensiveProfile).mockImplementation(async (pk: string) => {
				profileCalls.push(pk);
				await profilePromise;
				return { reviews: [], npub: pk };
			});

			mockFindEvents.mockResolvedValue({
				data: [
					createServiceEvent('b'.repeat(64), pubkey, 'service-1'),
					createServiceEvent('c'.repeat(64), pubkey, 'service-2'),
					createServiceEvent('d'.repeat(64), pubkey, 'service-3')
				]
			});

			const resultPromise = findServices({ page: 1, limit: 8 });
			
			await new Promise(r => setTimeout(r, 100));
			
			resolveProfile!({ reviews: [], npub: pubkey });
			
			const result = await resultPromise;

			expect(result.services).toHaveLength(3);
			expect(profileCalls.filter(pk => pk === pubkey)).toHaveLength(1);
		});
	});

	describe('deletion lookup only on cache miss', () => {
		it('should NOT call requestEvents for deletions when services cache hits', async () => {
			let deleteCallCount = 0;
			mockRequestEvents.mockImplementation(async () => {
				deleteCallCount++;
				return { data: [] };
			});

			mockFindEvents.mockResolvedValue({
				data: [createServiceEvent('a'.repeat(64), 'b'.repeat(64), 'service-1')]
			});

			await findServices({ page: 1, limit: 8 });
			const firstDeleteCalls = deleteCallCount;

			deleteCallCount = 0;
			await findServices({ page: 1, limit: 8 });
			
			expect(deleteCallCount).toBe(0);
		});
	});
});