import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from 'nostr-tools';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { cleanup, findMyServices } from '$lib/nostr/findServices';

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		findEvents: vi.fn(),
		requestEvents: vi.fn()
	}
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn().mockResolvedValue('1'.repeat(64))
}));

vi.mock('$lib/nostr/profile', () => ({
	fetchComprehensiveProfile: vi.fn().mockResolvedValue(null)
}));

function createServiceEvent(): Event {
	return {
		id: 'service-event-1',
		pubkey: '1'.repeat(64),
		created_at: 1_700_000_000,
		kind: KINDS.SERVICE_ACTIVE,
		tags: [['d', 'service-123']],
		content: JSON.stringify({
			uniqueId: 'service-123',
			status: 'active',
			title: 'Brand Identity Sprint',
			description: 'Logo, color palette, and social avatar pack.',
			serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
			locationDetails: {},
			pricing: {
				type: ServicePricingTypeEnum.FIXED,
				amount: 125,
				currency: 'USD'
			},
			skills: ['Design'],
			categories: [{ id: 'design', name: 'Design', slug: 'design' }],
			createdAt: 1_700_000_000,
			creator: {
				username: 'provider',
				avatar: ''
			}
		}),
		sig: 'f'.repeat(128)
	};
}

describe('findMyServices deletion filtering', () => {
	const mockFindEvents = vi.mocked(nostrEventsService.findEvents);
	const mockRequestEvents = vi.mocked(nostrEventsService.requestEvents);

	beforeEach(() => {
		vi.clearAllMocks();
		cleanup();
		mockFindEvents.mockResolvedValue({
			data: [createServiceEvent()]
		});
		mockRequestEvents.mockResolvedValue({
			data: [
				{
					id: 'delete-1',
					pubkey: 'pk',
					created_at: 1,
					kind: 1,
					content: '{}',
					sig: '',
					tags: [['e', 'service-event-1']]
				}
			]
		});
	});

	it('filters deleted services even when deletion events only include e tags', async () => {
		const result = await findMyServices({ limit: 20 });

		expect(mockRequestEvents).toHaveBeenCalledWith({
			filters: [
				{
					kinds: [5],
					limit: 1000
				}
			]
		});
		expect(result.services).toHaveLength(0);
	});
});
