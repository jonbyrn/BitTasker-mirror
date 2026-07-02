import { beforeEach, describe, expect, it, vi } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';

const hoisted = vi.hoisted(() => ({
	mockGetSignedEvent: vi.fn(),
	mockGetNostrKeyPair: vi.fn(),
	mockGetNpub: vi.fn(),
	mockPublishEvent: vi.fn(),
	mockRequestEvents: vi.fn(),
	mockEncrypt: vi.fn(),
	mockDecrypt: vi.fn(),
	mockConversationKey: vi.fn()
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: (...args: Parameters<typeof hoisted.mockGetSignedEvent>) =>
		hoisted.mockGetSignedEvent(...args)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: (...args: Parameters<typeof hoisted.mockGetNostrKeyPair>) =>
		hoisted.mockGetNostrKeyPair(...args),
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

vi.mock('$lib/nostr/nip44', () => ({
	default: {
		getConversationKey: (...args: Parameters<typeof hoisted.mockConversationKey>) =>
			hoisted.mockConversationKey(...args),
		encrypt: (...args: Parameters<typeof hoisted.mockEncrypt>) => hoisted.mockEncrypt(...args),
		decrypt: (...args: Parameters<typeof hoisted.mockDecrypt>) => hoisted.mockDecrypt(...args)
	}
}));

describe('exact-location companion events', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.mockGetNostrKeyPair.mockResolvedValue({
			nsec: new Uint8Array(32).fill(7),
			npub: 'f'.repeat(64)
		});
		hoisted.mockGetNpub.mockResolvedValue('f'.repeat(64));
		hoisted.mockConversationKey.mockResolvedValue('conversation-key');
		hoisted.mockEncrypt.mockImplementation(async (plaintext: string) => `enc:${plaintext}`);
		hoisted.mockDecrypt.mockImplementation(async (ciphertext: string) => ciphertext.slice(4));
		hoisted.mockGetSignedEvent.mockImplementation(async (event) => ({
			...event,
			id: 'signed-event-id',
			pubkey: 'f'.repeat(64),
			sig: 'a'.repeat(128)
		}));
		hoisted.mockPublishEvent.mockResolvedValue(undefined);
		hoisted.mockRequestEvents.mockResolvedValue({
			data: []
		});
	});

	it('publishes exact task locations in an encrypted companion event keyed by the task id', async () => {
		const { publishExactTaskLocations } = await import('$lib/nostr/exact-location');

		await publishExactTaskLocations({
			entityId: 'task-123',
			pickupLocation: {
				displayName: '123 Main St, Austin, TX',
				formattedAddress: '123 Main St, Austin, TX',
				latitude: 30.2672,
				longitude: -97.7431,
				locationLoaded: true,
				zipCode: ''
			},
			dropOffLocation: null
		});

		expect(hoisted.mockEncrypt).toHaveBeenCalledTimes(1);
		expect(hoisted.mockPublishEvent).toHaveBeenCalledTimes(1);
		expect(hoisted.mockPublishEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: KINDS.PROFILE_LOCATION,
				tags: expect.arrayContaining([
					['d', 'task-location:task-123'],
					['scope', 'exact-location'],
					['entity', 'task']
				]),
				content: expect.stringMatching(/^enc:/)
			})
		);
	});

	it('propagates publish helper failures so callers can fail closed', async () => {
		const { publishExactTaskLocations } = await import('$lib/nostr/exact-location');
		hoisted.mockPublishEvent.mockRejectedValueOnce(new Error('publish failed'));

		await expect(
			publishExactTaskLocations({
				entityId: 'task-123',
				pickupLocation: {
					displayName: '123 Main St, Austin, TX',
					formattedAddress: '123 Main St, Austin, TX',
					latitude: 30.2672,
					longitude: -97.7431,
					locationLoaded: true,
					zipCode: ''
				},
				dropOffLocation: null
			})
		).rejects.toThrow('publish failed');
	});

	it('retrieves the latest exact service location companion event for the current user', async () => {
		const { getExactServiceLocation } = await import('$lib/nostr/exact-location');
		hoisted.mockRequestEvents.mockResolvedValue({
			data: [
				{
					tags: [
						['d', 'service-location:service-123'],
						['scope', 'exact-location'],
						['entity', 'service']
					],
					content:
						'enc:{"version":1,"entityType":"service","entityId":"service-123","payload":{"taskeeLocation":{"displayName":"123 Main St, Austin, TX","formattedAddress":"123 Main St, Austin, TX","latitude":30.2672,"longitude":-97.7431,"locationLoaded":true}}}',
					created_at: 1_700_000_100
				},
				{
					tags: [
						['d', 'service-location:service-123'],
						['scope', 'exact-location'],
						['entity', 'service']
					],
					content:
						'enc:{"version":1,"entityType":"service","entityId":"service-123","payload":{"taskeeLocation":{"displayName":"Older","formattedAddress":"Older","latitude":1,"longitude":1,"locationLoaded":true}}}',
					created_at: 1_700_000_000
				}
			]
		});

		const result = await getExactServiceLocation('service-123');

		expect(hoisted.mockRequestEvents).toHaveBeenCalledWith({
			filters: [
				{
					kinds: [KINDS.PROFILE_LOCATION],
					authors: ['f'.repeat(64)],
					'#d': ['service-location:service-123'],
					limit: 5
				}
			]
		});
		expect(result).toEqual({
			taskeeLocation: {
				displayName: '123 Main St, Austin, TX',
				formattedAddress: '123 Main St, Austin, TX',
				latitude: 30.2672,
				longitude: -97.7431,
				locationLoaded: true
			}
		});
	});

	it('ignores exact-location events with the wrong entity tags even when they are newer', async () => {
		const { getExactServiceLocation } = await import('$lib/nostr/exact-location');
		hoisted.mockRequestEvents.mockResolvedValue({
			data: [
				{
					tags: [
						['d', 'service-location:service-123'],
						['scope', 'exact-location'],
						['entity', 'task']
					],
					content:
						'enc:{"version":1,"entityType":"task","entityId":"service-123","payload":{"pickupLocation":{"displayName":"Wrong entity"}}}',
					created_at: 1_700_000_200
				},
				{
					tags: [
						['d', 'service-location:service-123'],
						['scope', 'exact-location'],
						['entity', 'service']
					],
					content:
						'enc:{"version":1,"entityType":"service","entityId":"service-123","payload":{"taskeeLocation":{"displayName":"123 Main St, Austin, TX","formattedAddress":"123 Main St, Austin, TX","latitude":30.2672,"longitude":-97.7431,"locationLoaded":true}}}',
					created_at: 1_700_000_100
				}
			]
		});

		const result = await getExactServiceLocation('service-123');

		expect(result).toEqual({
			taskeeLocation: {
				displayName: '123 Main St, Austin, TX',
				formattedAddress: '123 Main St, Austin, TX',
				latitude: 30.2672,
				longitude: -97.7431,
				locationLoaded: true
			}
		});
	});

	it('propagates read helper failures so callers decide whether to degrade safely', async () => {
		const { getExactServiceLocation } = await import('$lib/nostr/exact-location');
		hoisted.mockRequestEvents.mockRejectedValueOnce(new Error('request failed'));

		await expect(getExactServiceLocation('service-123')).rejects.toThrow('request failed');
	});
});
