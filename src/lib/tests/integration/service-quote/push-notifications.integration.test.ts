import { beforeEach, describe, expect, it, vi } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';

const publishNostrEvent = vi.fn();
const queryNostrEvents = vi.fn();
const getSignedEvent = vi.fn();
const publishToMultipleRelays = vi.fn();
const getNpub = vi.fn();
const getNostrKeyPair = vi.fn();
const getServiceQuoteFeatureFlags = vi.fn();
const detectRelayCapability = vi.fn();
const selectProposalPublishRelays = vi.fn();
const validateServiceQuoteRequestEvent = vi.fn();
const validateServiceProposalEvent = vi.fn();
const validateServiceProposalStatusEvent = vi.fn();
const canPublishAcceptedStatus = vi.fn();
const getServiceQuoteMessageType = vi.fn();
const sendNotificationToNpubs = vi.fn();

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent,
	publishNostrEvent,
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

vi.mock('$lib/nostr/nip44', () => ({
	default: {
		encrypt: vi.fn().mockResolvedValue('encrypted-content'),
		getConversationKey: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
	}
}));

vi.mock('$lib/utils/service-quote/protocol', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/service-quote/protocol')>(
		'$lib/utils/service-quote/protocol'
	);

	return {
		...actual,
		detectRelayCapability,
		selectProposalPublishRelays,
		validateServiceQuoteRequestEvent,
		validateServiceProposalEvent,
		validateServiceProposalStatusEvent,
		canPublishAcceptedStatus,
		getServiceQuoteMessageType
	};
});

describe('service quote publish integration notifications', () => {
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
		validateServiceProposalEvent.mockImplementation((event) => event);
		validateServiceProposalStatusEvent.mockImplementation((event) => event);
		detectRelayCapability.mockResolvedValue({ relay: 'wss://relay.example', state: 'supports_40' });
		selectProposalPublishRelays.mockReturnValue(['wss://relay.example']);
		publishToMultipleRelays.mockResolvedValue([{ relay: 'wss://relay.example', success: true }]);
		sendNotificationToNpubs.mockResolvedValue(undefined);

		const { resetServiceQuoteSideEffectLedger } = await import(
			'$lib/utils/service-quote/notifications'
		);
		resetServiceQuoteSideEffectLedger();
	});

	it('emits provider inquiry push from the canonical request publish path and skips duplicate resend', async () => {
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
		publishNostrEvent.mockResolvedValue({
			event: requestEvent,
			results: [{ relay: 'wss://relay.example', success: true }]
		});

		await publishServiceQuoteRequest({
			service: service as never,
			payload: {
				title: 'Need help',
				description: 'Please quote'
			},
			quoteRequestId: 'qr_valid123'
		});

		await vi.waitFor(() => {
			expect(sendNotificationToNpubs).toHaveBeenCalledTimes(1);
		});

		queryNostrEvents.mockResolvedValueOnce([requestEvent]);
		await publishServiceQuoteRequest({
			service: service as never,
			payload: {
				title: 'Need help',
				description: 'Please quote'
			},
			quoteRequestId: 'qr_valid123'
		});

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(sendNotificationToNpubs).toHaveBeenCalledTimes(1);
		const requestNotification = sendNotificationToNpubs.mock.calls[0][0];
		expect(requestNotification.type).toBe('service_quote_request_received');
		const requestUrl = new URL(requestNotification.clickAction);
		expect(requestUrl.searchParams.get('tab')).toBe('my-services');
		expect(requestUrl.searchParams.get('view')).toBe('quotes');
		expect(decodeURIComponent(requestUrl.searchParams.get('service') ?? '')).toBe(
			`30402:${service.npub}:${service.uniqueId}`
		);
		expect(requestUrl.searchParams.get('request')).toBe('qr_valid123');
	});

	it('emits tasker proposal push from the canonical proposal publish path', async () => {
		const { publishServiceProposal } = await import('$lib/utils/service-quote/publish');

		const requestEvent = {
			id: 'request-event-id',
			kind: KINDS.SERVICE_QUOTE_REQUEST,
			pubkey: 'b'.repeat(64),
			created_at: 1_700_000_000,
			tags: [['p', 'a'.repeat(64)]],
			content: {
				type: 'service-quote-request',
				quoteRequestId: 'qr_valid123',
				serviceId: `30402:${'a'.repeat(64)}:service-123`,
				serviceAddress: `30402:${'a'.repeat(64)}:service-123`,
				pricingType: 'FIXED',
				inquiry: {
					title: 'Need help',
					description: 'Please quote'
				},
				timestamp: 1_700_000_000,
				version: 'v1'
			},
			sig: 'sig'
		};
		queryNostrEvents
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([requestEvent]);
		const proposalEvent = {
			id: 'proposal-event-id',
			kind: KINDS.SERVICE_PROPOSAL,
			pubkey: 'a'.repeat(64),
			created_at: 1_700_000_100,
			tags: [['p', 'b'.repeat(64)]],
			content: {
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceAddress: `30402:${'a'.repeat(64)}:service-123`
			},
			sig: 'sig'
		};
		getSignedEvent.mockResolvedValue({
			...proposalEvent,
			content: 'encrypted-content'
		});
		validateServiceProposalEvent.mockReturnValue(proposalEvent);

		await publishServiceProposal({
			content: {
				type: 'service-proposal',
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: `30402:${'a'.repeat(64)}:service-123`,
				serviceAddress: `30402:${'a'.repeat(64)}:service-123`,
				paymentType: 'FIXED',
				amountUsdt: '125.00',
				description: 'Test proposal',
				estimatedDuration: '2 days',
				estimatedStartTime: 1_700_010_000,
				estimatedEndTime: 1_700_020_000,
				expirationDays: 2,
				expirationHours: 0,
				expirationTimestamp: 0,
				freelancerRskAddress: '0x1111111111111111111111111111111111111111',
				freelancerFeeTier: 1,
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id'
				},
				timestamp: 1_700_000_100,
				version: 'v1'
			},
			requestEventId: 'request-event-id',
			taskerPubkey: 'b'.repeat(64),
			relays: ['wss://relay.example']
		});

		await vi.waitFor(() => {
			expect(sendNotificationToNpubs).toHaveBeenCalledTimes(1);
		});

		const proposalNotification = sendNotificationToNpubs.mock.calls[0][0];
		expect(proposalNotification.type).toBe('service_quote_proposal_received');
		const proposalUrl = new URL(proposalNotification.clickAction);
		expect(proposalUrl.searchParams.get('tab')).toBe('quotes');
		expect(proposalUrl.searchParams.get('view')).toBe('tasker');
		expect(proposalUrl.searchParams.get('request')).toBe('qr_valid123');
	});
});
