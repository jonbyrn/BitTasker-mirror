import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createService, findServiceByUniqueId } from '$lib/nostr/service';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

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

describe('service instant-buy nostr round-trip', () => {
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

	it('serializes instantBuyLeadHours into the published service content', async () => {
		await createService({
			title: 'Logo Sprint',
			description: 'Brand identity package',
			serviceLocationTypes: [],
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
			categories: [{ id: 'design', name: 'Design', slug: 'design', description: '' }],
			skills: ['Branding'],
			portfolio: [],
			faqs: [],
			status: 'active',
			createdAt: 0,
			creator: {
				username: '',
				avatar: ''
			},
			instantBuyLeadHours: 48
		} as unknown as Parameters<typeof createService>[0]);

		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);
		const publishedEvent = hoisted.mockPublishEvent.mock.calls[0]?.[0] as { content: string };
		expect(JSON.parse(publishedEvent.content)).toMatchObject({
			instantBuyLeadHours: 48
		});
	});

	it('parses instantBuyLeadHours from the latest service event', async () => {
		hoisted.mockRequestEvents
			.mockResolvedValueOnce({
				data: [
					{
						id: 'service-event-1',
						pubkey: 'a'.repeat(64),
						created_at: 1_700_000_000,
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
							categories: [],
							skills: [],
							portfolio: [],
							faqs: [],
							status: 'active',
							createdAt: 1_700_000_000,
							creator: {
								username: 'Provider',
								avatar: ''
							},
							instantBuyLeadHours: 48
						})
					}
				]
			})
			.mockResolvedValueOnce({
				data: []
			});

		await expect(findServiceByUniqueId('service-123')).resolves.toMatchObject({
			id: 'service-event-1',
			uniqueId: 'service-123',
			instantBuyLeadHours: 48
		});
	});
});
