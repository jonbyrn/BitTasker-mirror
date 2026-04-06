import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateService } from '$lib/nostr/service';
import KINDS from '$lib/utils/constants/kinds';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { SERVICE_EDIT_CONFLICT_CODE } from '$lib/utils/service-edit-conflict';

const hoisted = vi.hoisted(() => ({
	mockGetNpub: vi.fn(),
	mockPublishEvent: vi.fn(),
	mockRequestEvents: vi.fn(),
	mockGetSignedEvent: vi.fn()
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

function createServiceEvent(
	eventId: string,
	overrides: { kind?: number; status?: 'active' | 'inactive' | 'sold' } = {}
) {
	return {
		id: eventId,
		pubkey: 'a'.repeat(64),
		created_at: 1_700_000_000,
		kind: overrides.kind ?? KINDS.SERVICE_ACTIVE,
		tags: [['d', 'service-123']],
		content: JSON.stringify({
			uniqueId: 'service-123',
			title: 'Logo Sprint',
			description: 'Brand identity package',
			serviceLocationTypes: [],
			pricing: {
				type: ServicePricingTypeEnum.FIXED,
				currency: 'USDt',
				amount: 125
			},
			categories: [{ id: 'design', name: 'Design', slug: 'design' }],
			skills: ['Branding'],
			portfolio: [],
			faqs: [],
			status: overrides.status ?? 'active',
			createdAt: 1_700_000_000,
			creator: {
				username: 'Provider',
				avatar: ''
			}
		})
	};
}

describe('updateService edit conflict handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.mockGetNpub.mockResolvedValue('a'.repeat(64));
		hoisted.mockGetSignedEvent.mockImplementation(async (event) => ({
			...event,
			id: 'signed-event-id',
			pubkey: 'a'.repeat(64),
			sig: 'b'.repeat(128)
		}));
		hoisted.mockPublishEvent.mockResolvedValue(undefined);
	});

	it('rejects stale updates when the latest service event no longer matches the loaded source version', async () => {
		hoisted.mockRequestEvents.mockResolvedValue({
			data: [createServiceEvent('event-new')]
		});

		await expect(
			updateService(
				'service-123',
				{
					title: 'Updated title'
				},
				{
					expectedServiceEventId: 'event-old'
				}
			)
		).rejects.toMatchObject({
			code: SERVICE_EDIT_CONFLICT_CODE,
			expectedServiceEventId: 'event-old',
			latestServiceEventId: 'event-new'
		});
		expect(hoisted.mockPublishEvent).not.toHaveBeenCalled();
	});

	it('publishes when the loaded source version still matches the latest service event', async () => {
		hoisted.mockRequestEvents.mockResolvedValue({
			data: [createServiceEvent('event-current')]
		});

		await expect(
			updateService(
				'service-123',
				{
					title: 'Updated title'
				},
				{
					expectedServiceEventId: 'event-current'
				}
			)
		).resolves.toBe('signed-event-id');
		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);
	});

	it('keeps published services on the active listing kind when marking them inactive', async () => {
		hoisted.mockRequestEvents.mockResolvedValue({
			data: [createServiceEvent('event-current')]
		});

		await expect(
			updateService('service-123', {
				status: 'inactive'
			})
		).resolves.toBe('signed-event-id');

		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);
		const publishedEvent = hoisted.mockPublishEvent.mock.calls[0][0];
		expect(publishedEvent.kind).toBe(KINDS.SERVICE_ACTIVE);
		expect(JSON.parse(publishedEvent.content)).toMatchObject({
			uniqueId: 'service-123',
			status: 'inactive'
		});
	});

	it('keeps draft listings on the draft kind until they are published', async () => {
		hoisted.mockRequestEvents.mockResolvedValue({
			data: [createServiceEvent('event-draft', { kind: KINDS.SERVICE_DRAFT, status: 'inactive' })]
		});

		await expect(
			updateService('service-123', {
				title: 'Revised draft copy',
				status: 'inactive'
			})
		).resolves.toBe('signed-event-id');

		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);
		const publishedEvent = hoisted.mockPublishEvent.mock.calls[0][0];
		expect(publishedEvent.kind).toBe(KINDS.SERVICE_DRAFT);
		expect(JSON.parse(publishedEvent.content)).toMatchObject({
			uniqueId: 'service-123',
			status: 'inactive',
			title: 'Revised draft copy'
		});
	});

	it('falls back to event-id lookup when a service is missing its unique id locally', async () => {
		const eventId = 'c'.repeat(64);
		hoisted.mockRequestEvents.mockResolvedValue({
			data: [createServiceEvent(eventId)]
		});

		await expect(
			updateService(eventId, {
				status: 'inactive'
			})
		).resolves.toBe('signed-event-id');

		expect(hoisted.mockRequestEvents).toHaveBeenCalledWith({
			filters: [
				expect.objectContaining({
					'#d': [eventId],
					authors: ['a'.repeat(64)]
				}),
				expect.objectContaining({
					ids: [eventId],
					authors: ['a'.repeat(64)]
				})
			]
		});
		expect(JSON.parse(hoisted.mockPublishEvent.mock.calls[0][0].content)).toMatchObject({
			uniqueId: 'service-123',
			status: 'inactive'
		});
	});
});
