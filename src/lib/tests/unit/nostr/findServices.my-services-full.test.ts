import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { cleanup, findMyServices } from '$lib/nostr/findServices';

const mockGetNpub = vi.fn();

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		findEvents: vi.fn(),
		requestEvents: vi.fn()
	}
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: () => mockGetNpub()
}));

vi.mock('$lib/nostr/profile', () => ({
	fetchComprehensiveProfile: vi.fn().mockResolvedValue(null)
}));

const TEST_HEX_PUBKEY = 'a'.repeat(64);
const TEST_NPUB = nip19.npubEncode(TEST_HEX_PUBKEY);

function createServiceEvent(overrides: {
	eventId?: string;
	pubkey?: string;
	uniqueId?: string;
	createdAt?: number;
	status?: 'active' | 'inactive' | 'paused' | 'draft';
	kind?: number;
	content?: Record<string, unknown>;
}): Event {
	const {
		eventId = 'service-event-1',
		pubkey = TEST_HEX_PUBKEY,
		uniqueId = 'service-123',
		createdAt = 1_700_000_000,
		status = 'active',
		kind = KINDS.SERVICE_ACTIVE,
		content = {}
	} = overrides;

	return {
		id: eventId,
		pubkey,
		created_at: createdAt,
		kind,
		tags: [['d', uniqueId]],
		content: JSON.stringify({
			uniqueId,
			status,
			title: `Service ${uniqueId}`,
			description: 'Service description',
			serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
			locationDetails: {},
			pricing: { type: ServicePricingTypeEnum.FIXED, amount: 125, currency: 'USD' },
			skills: ['Design'],
			categories: [{ id: 'design', name: 'Design', slug: 'design' }],
			createdAt,
			creator: { username: 'provider', avatar: '' },
			...content
		}),
		sig: 'f'.repeat(128)
	};
}

describe('findMyServices', () => {
	const mockFindEvents = vi.mocked(nostrEventsService.findEvents);
	const mockRequestEvents = vi.mocked(nostrEventsService.requestEvents);

	beforeEach(() => {
		vi.clearAllMocks();
		cleanup();
		mockGetNpub.mockResolvedValue(TEST_NPUB);
		mockRequestEvents.mockResolvedValue({ data: [] });
	});

	describe('empty results', () => {
		it('should return empty services array when user has no services', async () => {
			mockFindEvents.mockResolvedValue({ data: [] });

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(0);
			expect(result.total).toBe(0);
			expect(result.hasMore).toBe(false);
		});

		it('should return empty when npub is not available', async () => {
			mockGetNpub.mockResolvedValue(null);

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(0);
			expect(result.total).toBe(0);
			expect(result.hasMore).toBe(false);
		});

		it('should return empty when npub is invalid type', async () => {
			mockGetNpub.mockResolvedValue('invalid');

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(0);
			expect(result.total).toBe(0);
			expect(result.hasMore).toBe(false);
		});
	});

	describe('single service returned', () => {
		it('should return single service when user has one service', async () => {
			const event = createServiceEvent({
				eventId: 'event-1',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				status: 'active'
			});
			mockFindEvents.mockResolvedValue({ data: [event] });

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(1);
			expect(result.total).toBe(1);
			expect(result.hasMore).toBe(false);
			expect(result.services[0].uniqueId).toBe('service-1');
		});

		it('should handle service with draft status', async () => {
			const event = createServiceEvent({
				eventId: 'event-draft',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-draft',
				status: 'draft',
				kind: KINDS.SERVICE_DRAFT
			});
			mockFindEvents.mockResolvedValue({ data: [event] });

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(1);
			expect(result.services[0].status).toBe('draft');
		});
	});

	describe('multiple services returned and deduplicated', () => {
		it('should deduplicate services with same uniqueId keeping latest', async () => {
			const olderEvent = createServiceEvent({
				eventId: 'event-old',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				createdAt: 1_699_999_000,
				status: 'active'
			});
			const newerEvent = createServiceEvent({
				eventId: 'event-new',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				createdAt: 1_700_000_000,
				status: 'paused'
			});
			mockFindEvents.mockResolvedValue({ data: [olderEvent, newerEvent] });

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(1);
			expect(result.services[0].id).toBe('event-new');
			expect(result.services[0].status).toBe('paused');
		});

		it('should return multiple distinct services', async () => {
			const event1 = createServiceEvent({
				eventId: 'event-1',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				status: 'active'
			});
			const event2 = createServiceEvent({
				eventId: 'event-2',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-2',
				status: 'active'
			});
			const event3 = createServiceEvent({
				eventId: 'event-3',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-3',
				status: 'active'
			});
			mockFindEvents.mockResolvedValue({ data: [event1, event2, event3] });

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(3);
			expect(result.total).toBe(3);
		});

		it('should return empty when latest version is deleted', async () => {
			const olderEvent = createServiceEvent({
				eventId: 'event-old',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				createdAt: 1_699_999_000,
				status: 'active'
			});
			const newerEvent = createServiceEvent({
				eventId: 'event-new',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				createdAt: 1_700_000_000,
				status: 'paused'
			});
			mockFindEvents.mockResolvedValue({ data: [olderEvent, newerEvent] });
			mockRequestEvents.mockResolvedValue({
				data: [
					{
						id: 'delete-new',
						pubkey: 'pk',
						created_at: 1,
						kind: 1,
						content: '{}',
						sig: '',
						tags: [['e', 'event-new']]
					}
				]
			});

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(0);
		});
	});

	describe('error handling', () => {
		it('should return empty services on findEvents error', async () => {
			mockFindEvents.mockRejectedValue(new Error('Network error'));

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(0);
			expect(result.total).toBe(0);
			expect(result.hasMore).toBe(false);
		});

		it('should handle Promise.allSettled failures gracefully', async () => {
			const validEvent = createServiceEvent({
				eventId: 'event-valid',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-valid',
				status: 'active'
			});
			const invalidEvent = {
				id: 'event-invalid',
				pubkey: TEST_HEX_PUBKEY,
				created_at: 1_700_000_000,
				kind: KINDS.SERVICE_ACTIVE,
				tags: [['d', 'service-invalid']],
				content: 'invalid-json',
				sig: 'f'.repeat(128)
			} as Event;
			mockFindEvents.mockResolvedValue({ data: [validEvent, invalidEvent] });

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(1);
			expect(result.services[0].uniqueId).toBe('service-valid');
		});

		it('should handle nip19 decode error for npub', async () => {
			mockGetNpub.mockResolvedValue('npub1invalid');

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(0);
			expect(result.total).toBe(0);
		});
	});

	describe('filter by status', () => {
		it('should filter services by active status', async () => {
			const activeEvent = createServiceEvent({
				eventId: 'event-active',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-active',
				status: 'active'
			});
			const pausedEvent = createServiceEvent({
				eventId: 'event-paused',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-paused',
				status: 'paused'
			});
			mockFindEvents.mockResolvedValue({ data: [activeEvent, pausedEvent] });

			const result = await findMyServices({ limit: 20, status: ['active'] });

			expect(result.services).toHaveLength(1);
			expect(result.services[0].status).toBe('active');
		});

		it('should filter services by multiple statuses', async () => {
			const activeEvent = createServiceEvent({
				eventId: 'event-active',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-active',
				status: 'active'
			});
			const soldEvent = createServiceEvent({
				eventId: 'event-sold',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-sold',
				status: 'sold' as unknown as 'active'
			});
			const inactiveEvent = createServiceEvent({
				eventId: 'event-inactive',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-inactive',
				status: 'inactive'
			});
			mockFindEvents.mockResolvedValue({ data: [activeEvent, soldEvent, inactiveEvent] });

			const result = await findMyServices({ limit: 20, status: ['active', 'sold'] });

			expect(result.services).toHaveLength(2);
			expect(result.services.every((s) => ['active', 'sold'].includes(s.status))).toBe(true);
		});

		it('should return empty when no services match status filter', async () => {
			const activeEvent = createServiceEvent({
				eventId: 'event-active',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-active',
				status: 'active'
			});
			mockFindEvents.mockResolvedValue({ data: [activeEvent] });

			const result = await findMyServices({ limit: 20, status: ['sold'] });

			expect(result.services).toHaveLength(0);
		});
	});

	describe('pagination handling', () => {
		it('should set hasMore true when events length equals limit', async () => {
			const events = Array.from({ length: 20 }, (_, i) =>
				createServiceEvent({
					eventId: `event-${i}`,
					pubkey: TEST_HEX_PUBKEY,
					uniqueId: `service-${i}`,
					status: 'active'
				})
			);
			mockFindEvents.mockResolvedValue({ data: events });

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(20);
			expect(result.hasMore).toBe(true);
		});

		it('should set hasMore false when events length is less than limit', async () => {
			const events = [
				createServiceEvent({
					eventId: 'event-1',
					pubkey: TEST_HEX_PUBKEY,
					uniqueId: 'service-1',
					status: 'active'
				}),
				createServiceEvent({
					eventId: 'event-2',
					pubkey: TEST_HEX_PUBKEY,
					uniqueId: 'service-2',
					status: 'active'
				})
			];
			mockFindEvents.mockResolvedValue({ data: events });

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(2);
			expect(result.hasMore).toBe(false);
		});

		it('should limit services to specified limit', async () => {
			const events = Array.from({ length: 10 }, (_, i) =>
				createServiceEvent({
					eventId: `event-${i}`,
					pubkey: TEST_HEX_PUBKEY,
					uniqueId: `service-${i}`,
					status: 'active'
				})
			);
			mockFindEvents.mockResolvedValue({ data: events });

			const result = await findMyServices({ limit: 5 });

			expect(result.services).toHaveLength(5);
		});

		it('should use default SERVICES_PER_PAGE when limit not specified', async () => {
			const events = Array.from({ length: 25 }, (_, i) =>
				createServiceEvent({
					eventId: `event-${i}`,
					pubkey: TEST_HEX_PUBKEY,
					uniqueId: `service-${i}`,
					status: 'active'
				})
			);
			mockFindEvents.mockResolvedValue({ data: events });

			const result = await findMyServices({});

			expect(result.services.length).toBeLessThanOrEqual(20);
		});

		it('should apply until parameter to filter', async () => {
			const event = createServiceEvent({
				eventId: 'event-1',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				status: 'active'
			});
			mockFindEvents.mockResolvedValue({ data: [event] });

			await findMyServices({ limit: 20, until: 1_700_000_500 });

			expect(mockFindEvents).toHaveBeenCalledWith(
				expect.objectContaining({
					until: 1_700_000_500
				})
			);
		});

		it('should apply since parameter to filter', async () => {
			const event = createServiceEvent({
				eventId: 'event-1',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				status: 'active'
			});
			mockFindEvents.mockResolvedValue({ data: [event] });

			await findMyServices({ limit: 20, since: 1_699_999_000 });

			expect(mockFindEvents).toHaveBeenCalledWith(
				expect.objectContaining({
					since: 1_699_999_000
				})
			);
		});
	});

	describe('uses getNpub to filter own services', () => {
		it('should call getNpub to get user public key', async () => {
			const event = createServiceEvent({
				eventId: 'event-1',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				status: 'active'
			});
			mockFindEvents.mockResolvedValue({ data: [event] });

			await findMyServices({ limit: 20 });

			expect(mockGetNpub).toHaveBeenCalled();
		});

		it('should filter events by author hex pubkey', async () => {
			mockGetNpub.mockResolvedValue(TEST_NPUB);

			const event = createServiceEvent({
				eventId: 'event-1',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				status: 'active'
			});
			mockFindEvents.mockResolvedValue({ data: [event] });

			await findMyServices({ limit: 20 });

			expect(mockFindEvents).toHaveBeenCalledWith(
				expect.objectContaining({
					authors: [TEST_HEX_PUBKEY]
				})
			);
		});

		it('should handle raw hex pubkey without decoding', async () => {
			mockGetNpub.mockResolvedValue(TEST_HEX_PUBKEY);

			const event = createServiceEvent({
				eventId: 'event-1',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				status: 'active'
			});
			mockFindEvents.mockResolvedValue({ data: [event] });

			const result = await findMyServices({ limit: 20 });

			expect(result.services).toHaveLength(1);
		});

		it('should decode npub to hex when npub format is provided', async () => {
			mockGetNpub.mockResolvedValue(TEST_NPUB);

			const event = createServiceEvent({
				eventId: 'event-1',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				status: 'active'
			});
			mockFindEvents.mockResolvedValue({ data: [event] });

			await findMyServices({ limit: 20 });

			expect(mockFindEvents).toHaveBeenCalledWith(
				expect.objectContaining({
					authors: [TEST_HEX_PUBKEY]
				})
			);
		});
	});

	describe('search functionality', () => {
		it('should apply search filter to query', async () => {
			const event = createServiceEvent({
				eventId: 'event-1',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				status: 'active'
			});
			mockFindEvents.mockResolvedValue({ data: [event] });

			await findMyServices({ limit: 20, search: 'design' });

			expect(mockFindEvents).toHaveBeenCalledWith(
				expect.objectContaining({
					search: 'design'
				})
			);
		});

		it('should trim search string', async () => {
			const event = createServiceEvent({
				eventId: 'event-1',
				pubkey: TEST_HEX_PUBKEY,
				uniqueId: 'service-1',
				status: 'active'
			});
			mockFindEvents.mockResolvedValue({ data: [event] });

			await findMyServices({ limit: 20, search: '  design  ' });

			expect(mockFindEvents).toHaveBeenCalledWith(
				expect.objectContaining({
					search: 'design'
				})
			);
		});
	});
});
