import { describe, expect, it, vi, beforeEach } from 'vitest';
import { convertEventToService } from '$lib/nostr/findServices';
import { fetchComprehensiveProfile } from '$lib/nostr/profile';
import { normalizeServiceTierDeliveryTimes } from '$lib/utils/serviceTierDelivery';
import KINDS from '$lib/utils/constants/kinds';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import type { Event } from 'nostr-tools';

vi.mock('$lib/nostr/profile', () => ({
	fetchComprehensiveProfile: vi.fn().mockResolvedValue(null)
}));

vi.mock('$lib/utils/serviceTierDelivery', () => ({
	normalizeServiceTierDeliveryTimes: vi.fn((data) => data)
}));

function createServiceEvent(
	overrides: Partial<{
		id: string;
		pubkey: string;
		created_at: number;
		kind: number;
		content: string;
		tags: string[][];
	}> = {}
): Event {
	const defaultContent = {
		uniqueId: 'test-unique-id',
		status: 'active',
		title: 'Test Service',
		description: 'Test service description',
		serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
		locationDetails: {},
		pricing: { type: ServicePricingTypeEnum.FIXED, amount: 100, currency: 'USD' },
		skills: ['Design'],
		categories: [{ id: 'design', name: 'Design', slug: 'design' }],
		createdAt: 1_700_000_000,
		creator: { username: 'provider', avatar: '' }
	};

	return {
		id: 'a'.repeat(64),
		pubkey: 'b'.repeat(64),
		created_at: 1_700_000_000,
		kind: KINDS.SERVICE_ACTIVE,
		tags: [['d', 'test-unique-id']],
		content: JSON.stringify(defaultContent),
		sig: 'f'.repeat(128),
		...overrides
	} as Event;
}

describe('convertEventToService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('valid service event (happy path)', () => {
		it('should convert a valid service event to a Service object', async () => {
			const event = createServiceEvent();
			const result = await convertEventToService(event);

			expect(result.id).toBe(event.id);
			expect(result.npub).toBe(event.pubkey);
			expect(result.eventKind).toBe(event.kind);
			expect(result.createdAt).toBe(event.created_at);
			expect(result.title).toBe('Test Service');
			expect(result.description).toBe('Test service description');
		});

		it('should call normalizeServiceTierDeliveryTimes with parsed content', async () => {
			const event = createServiceEvent();
			await convertEventToService(event);

			expect(normalizeServiceTierDeliveryTimes).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'Test Service',
					description: 'Test service description'
				})
			);
		});

		it('should include all required fields from content', async () => {
			const event = createServiceEvent();
			const result = await convertEventToService(event);

			expect(result.uniqueId).toBe('test-unique-id');
			expect(result.status).toBe('active');
			expect(result.pricing).toEqual({
				type: ServicePricingTypeEnum.FIXED,
				amount: 100,
				currency: 'USD'
			});
			expect(result.serviceLocationTypes).toEqual([ServiceLocationTypeEnum.REMOTE]);
			expect(result.skills).toEqual(['Design']);
			expect(result.categories).toEqual([{ id: 'design', name: 'Design', slug: 'design' }]);
		});
	});

	describe('missing required content fields', () => {
		it('should not throw when title is missing - field will be undefined', async () => {
			const content = {
				uniqueId: 'test-unique-id',
				status: 'active',
				description: 'Test service description',
				serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
				pricing: { type: ServicePricingTypeEnum.FIXED, amount: 100, currency: 'USD' },
				skills: ['Design'],
				categories: [{ id: 'design', name: 'Design', slug: 'design' }],
				createdAt: 1_700_000_000,
				creator: { username: 'provider', avatar: '' }
			};
			const event = createServiceEvent({ content: JSON.stringify(content) });

			const result = await convertEventToService(event);

			expect(result.title).toBeUndefined();
		});

		it('should not throw when description is missing - field will be undefined', async () => {
			const content = {
				uniqueId: 'test-unique-id',
				status: 'active',
				title: 'Test Service',
				serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
				pricing: { type: ServicePricingTypeEnum.FIXED, amount: 100, currency: 'USD' },
				skills: ['Design'],
				categories: [{ id: 'design', name: 'Design', slug: 'design' }],
				createdAt: 1_700_000_000,
				creator: { username: 'provider', avatar: '' }
			};
			const event = createServiceEvent({ content: JSON.stringify(content) });

			const result = await convertEventToService(event);

			expect(result.description).toBeUndefined();
		});
	});

	describe('invalid JSON in content', () => {
		it('should throw error when content is not valid JSON', () => {
			const event = createServiceEvent({ content: 'not valid json' });

			expect(() => convertEventToService(event)).toThrow();
		});

		it('should throw error when content is empty string', () => {
			const event = createServiceEvent({ content: '' });

			expect(() => convertEventToService(event)).toThrow();
		});

		it('should throw error when content is just whitespace', () => {
			const event = createServiceEvent({ content: '   ' });

			expect(() => convertEventToService(event)).toThrow();
		});
	});

	describe('missing pricing data', () => {
		it('should not throw when pricing is missing - field will be undefined', async () => {
			const content = {
				uniqueId: 'test-unique-id',
				status: 'active',
				title: 'Test Service',
				description: 'Test service description',
				serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
				skills: ['Design'],
				categories: [{ id: 'design', name: 'Design', slug: 'design' }],
				createdAt: 1_700_000_000,
				creator: { username: 'provider', avatar: '' }
			};
			const event = createServiceEvent({ content: JSON.stringify(content) });

			const result = await convertEventToService(event);

			expect(result.pricing).toBeUndefined();
		});
	});

	describe('missing serviceLocationTypes', () => {
		it('should not throw when serviceLocationTypes is missing - field will be undefined', async () => {
			const content = {
				uniqueId: 'test-unique-id',
				status: 'active',
				title: 'Test Service',
				description: 'Test service description',
				pricing: { type: ServicePricingTypeEnum.FIXED, amount: 100, currency: 'USD' },
				skills: ['Design'],
				categories: [{ id: 'design', name: 'Design', slug: 'design' }],
				createdAt: 1_700_000_000,
				creator: { username: 'provider', avatar: '' }
			};
			const event = createServiceEvent({ content: JSON.stringify(content) });

			const result = await convertEventToService(event);

			expect(result.serviceLocationTypes).toBeUndefined();
		});
	});

	describe('missing categories', () => {
		it('should not throw when categories is missing - field will be undefined', async () => {
			const content = {
				uniqueId: 'test-unique-id',
				status: 'active',
				title: 'Test Service',
				description: 'Test service description',
				serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
				pricing: { type: ServicePricingTypeEnum.FIXED, amount: 100, currency: 'USD' },
				skills: ['Design'],
				createdAt: 1_700_000_000,
				creator: { username: 'provider', avatar: '' }
			};
			const event = createServiceEvent({ content: JSON.stringify(content) });

			const result = await convertEventToService(event);

			expect(result.categories).toBeUndefined();
		});
	});

	describe('missing creator profile (npub lookup fails)', () => {
		it('should still return service when creator info is missing in content', async () => {
			const content = {
				uniqueId: 'test-unique-id',
				status: 'active',
				title: 'Test Service',
				description: 'Test service description',
				serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
				pricing: { type: ServicePricingTypeEnum.FIXED, amount: 100, currency: 'USD' },
				skills: ['Design'],
				categories: [{ id: 'design', name: 'Design', slug: 'design' }],
				createdAt: 1_700_000_000
			};
			const event = createServiceEvent({ content: JSON.stringify(content) });

			const result = await convertEventToService(event);

			expect(result.id).toBe(event.id);
			expect(result.npub).toBe(event.pubkey);
			expect(result.creator).toBeUndefined();
		});

		it('should not fetch profile when creator is missing', async () => {
			const content = {
				uniqueId: 'test-unique-id',
				status: 'active',
				title: 'Test Service',
				description: 'Test service description',
				serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
				pricing: { type: ServicePricingTypeEnum.FIXED, amount: 100, currency: 'USD' },
				skills: ['Design'],
				categories: [{ id: 'design', name: 'Design', slug: 'design' }],
				createdAt: 1_700_000_000
			};
			const event = createServiceEvent({ content: JSON.stringify(content) });

			await convertEventToService(event);

			expect(fetchComprehensiveProfile).not.toHaveBeenCalled();
		});

		it('should handle profile fetch returning null gracefully', async () => {
			vi.mocked(fetchComprehensiveProfile).mockResolvedValue(
				null as unknown as Awaited<ReturnType<typeof fetchComprehensiveProfile>>
			);
			const event = createServiceEvent();

			const result = await convertEventToService(event);

			expect(result.id).toBe(event.id);
			expect(result.creator?.rating).toBeUndefined();
		});

		it('should not add rating since convertEventToService is synchronous and does not fetch profiles', async () => {
			vi.mocked(fetchComprehensiveProfile).mockResolvedValue({
				reviews: [{ rating: 5 } as never, { rating: 4 } as never],
				npub: 'b'.repeat(64)
			} as unknown as Awaited<ReturnType<typeof fetchComprehensiveProfile>>);
			const event = createServiceEvent();

			const result = await convertEventToService(event);

			expect(result.creator?.rating).toBeUndefined();
		});
	});

	describe('valid event with all optional fields populated', () => {
		it('should preserve all optional fields when present', async () => {
			const content = {
				uniqueId: 'test-unique-id',
				status: 'active',
				title: 'Test Service',
				description: 'Test service description',
				serviceLocationTypes: [
					ServiceLocationTypeEnum.REMOTE,
					ServiceLocationTypeEnum.TASKEE_LOCATION
				],
				locationDetails: { address: '123 Test St' },
				pricing: {
					type: ServicePricingTypeEnum.FIXED,
					amount: 100,
					currency: 'USD',
					priceRanges: []
				},
				instantBuyLeadHours: 24,
				instantBuyDeliveryHours: 48,
				providerWalletAddress: 'bc1qtest',
				skills: ['Design', 'Development'],
				categories: [
					{ id: 'design', name: 'Design', slug: 'design' },
					{ id: 'dev', name: 'Development', slug: 'development' }
				],
				portfolio: [{ url: 'https://example.com/image.jpg', type: 'image' }],
				faqs: [{ question: 'What is this?', answer: 'A service' }],
				createdAt: 1_700_000_000,
				updatedAt: 1_700_000_100,
				creator: { username: 'provider', avatar: 'https://example.com/avatar.jpg' },
				translations: {}
			};
			const event = createServiceEvent({
				content: JSON.stringify(content),
				created_at: 1_700_000_100
			});

			const result = await convertEventToService(event);

			expect(result.locationDetails).toEqual({ address: '123 Test St' });
			expect(result.instantBuyLeadHours).toBe(24);
			expect(result.instantBuyDeliveryHours).toBe(48);
			expect(result.providerWalletAddress).toBe('bc1qtest');
			expect(result.portfolio).toEqual([{ url: 'https://example.com/image.jpg', type: 'image' }]);
			expect(result.faqs).toEqual([{ question: 'What is this?', answer: 'A service' }]);
			expect(result.updatedAt).toBe(1_700_000_100);
			expect(result.creator?.avatar).toBe('https://example.com/avatar.jpg');
		});
	});
});
