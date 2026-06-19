import { beforeEach, describe, expect, it, vi } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';

const queryNostrEvents = vi.fn();
const getSignedEvent = vi.fn();
const publishToMultipleRelays = vi.fn();
const getNpub = vi.fn();
const getNostrKeyPair = vi.fn();
const getServiceQuoteFeatureFlags = vi.fn();
const validateServiceQuoteRequestEvent = vi.fn();
const getServiceQuoteMessageType = vi.fn();
const sendNotificationToNpubs = vi.fn();
const encrypt = vi.fn();
const getConversationKey = vi.fn();
const debugWarn = vi.fn();

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: debugWarn,
		error: vi.fn(),
		extend: vi.fn(() => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }))
	})
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent,
	publishToMultipleRelays,
	queryNostrEvents
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub,
	getNostrKeyPair
}));

vi.mock('$lib/utils/features/serviceQuotes', () => ({
	getServiceQuoteFeatureFlags
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs
	}
}));

vi.mock('nostr-tools', async () => {
	const actual = await vi.importActual<typeof import('nostr-tools')>('nostr-tools');

	return {
		...actual,
		nip44: {
			...actual.nip44,
			encrypt,
			getConversationKey
		}
	};
});

vi.mock('$lib/utils/service-quote/protocol', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/service-quote/protocol')>(
		'$lib/utils/service-quote/protocol'
	);

	return {
		...actual,
		validateServiceQuoteRequestEvent,
		getServiceQuoteMessageType
	};
});

describe('service quote messaging mirror integration', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_CLIENT_URL', 'https://bittasker.test');
		window.localStorage.clear();

		getServiceQuoteFeatureFlags.mockReturnValue({
			read: true,
			write: true,
			accept: true,
			contractsFilter: true
		});
		getNpub.mockResolvedValue('b'.repeat(64));
		getNostrKeyPair.mockResolvedValue({ nsec: new Uint8Array([1, 2, 3]) });
		getServiceQuoteMessageType.mockReturnValue('service-quote-request');
		validateServiceQuoteRequestEvent.mockImplementation((event) => event);
		sendNotificationToNpubs.mockRejectedValue(new Error('push offline'));
		getConversationKey.mockResolvedValue(new Uint8Array([4, 5, 6]));
		encrypt.mockResolvedValue('encrypted-dm');
		getSignedEvent.mockResolvedValue({ id: 'mirror-dm-id' });
		publishToMultipleRelays.mockResolvedValue([{ relay: 'wss://relay.example', success: false }]);

		const { resetServiceQuoteSideEffectLedger } = await import(
			'$lib/utils/service-quote/notifications'
		);
		resetServiceQuoteSideEffectLedger();
	});

	it('keeps canonical request publish successful when push and DM mirror both fail', async () => {
		const { publishServiceQuoteRequest } = await import('$lib/utils/service-quote/publish');

		const service = {
			id: 'service-event-id',
			npub: 'a'.repeat(64),
			uniqueId: 'service-123',
			status: 'active',
			title: 'Premium logo package',
			description: 'Test',
			serviceLocationTypes: [],
			pricing: { type: 'INQUIRY_REQUIRED', currency: 'USDt' },
			skills: [],
			categories: [],
			createdAt: 1
		} as const;

		const requestEvent = {
			id: 'request-event-id',
			kind: KINDS.SERVICE_QUOTE_REQUEST,
			pubkey: 'b'.repeat(64),
			created_at: 1_700_000_000,
			tags: [['p', service.npub]],
			content: {
				serviceAddress: `30402:${service.npub}:${service.uniqueId}`,
				quoteRequestId: 'qr_valid123'
			},
			sig: 'sig'
		};

		queryNostrEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
		getSignedEvent
			.mockResolvedValueOnce({
				...requestEvent,
				content: 'encrypted-content'
			})
			.mockResolvedValueOnce({ id: 'mirror-dm-id' });
		publishToMultipleRelays
			.mockResolvedValueOnce([{ relay: 'wss://relay.example', success: true }])
			.mockResolvedValueOnce([{ relay: 'wss://relay.example', success: false }]);

		const result = await publishServiceQuoteRequest({
			service: service as never,
			payload: {
				title: 'Need help',
				description: 'Please quote'
			},
			quoteRequestId: 'qr_valid123',
			sideEffects: {
				dmMirror: true
			}
		});

		expect(result.event).toEqual(
			expect.objectContaining({
				id: 'request-event-id',
				kind: KINDS.SERVICE_QUOTE_REQUEST,
				pubkey: 'b'.repeat(64),
				content: expect.objectContaining({
					quoteRequestId: 'qr_valid123',
					serviceAddress: `30402:${service.npub}:${service.uniqueId}`,
					type: 'service-quote-request'
				})
			})
		);
		await vi.waitFor(() => {
			expect(getSignedEvent).toHaveBeenCalledTimes(2);
			expect(sendNotificationToNpubs).toHaveBeenCalledTimes(1);
			expect(debugWarn).toHaveBeenCalled();
		});
		expect(getSignedEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 4,
				tags: expect.arrayContaining([
					['p', service.npub],
					['m', 'service-quote-mirror'],
					['a', `30402:${service.npub}:${service.uniqueId}`],
					['e', 'request-event-id', '', 'root']
				])
			})
		);
	});
});
