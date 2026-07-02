import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, findServices } from '$lib/nostr/findServices';
import { servicesStore } from '$lib/stores/service.store';
import KINDS from '$lib/utils/constants/kinds';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import nostrEventsService from '$lib/api/services/nostr/events';

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		findEvents: vi.fn(),
		requestEvents: vi.fn()
	}
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

	describe('synchronous event conversion', () => {
		it('should convert all events without profile fetch (handled by UserInfoDisplay)', async () => {
			const pubkey = 'a'.repeat(64);

			mockFindEvents.mockResolvedValue({
				data: [
					createServiceEvent('b'.repeat(64), pubkey, 'service-1'),
					createServiceEvent('c'.repeat(64), pubkey, 'service-2'),
					createServiceEvent('d'.repeat(64), pubkey, 'service-3')
				]
			});

			const result = await findServices({ page: 1, limit: 8 });

			expect(result.services).toHaveLength(3);
			expect(result.services[0].uniqueId).toBe('service-1');
			expect(result.services[1].uniqueId).toBe('service-2');
			expect(result.services[2].uniqueId).toBe('service-3');
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

			deleteCallCount = 0;
			await findServices({ page: 1, limit: 8 });

			expect(deleteCallCount).toBe(0);
		});
	});
});
