import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotificationToNpubs = vi.fn();
const getSignedEvent = vi.fn();
const publishToMultipleRelays = vi.fn();
const getNostrKeyPair = vi.fn();
const getConversationKey = vi.fn();
const encrypt = vi.fn();

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs
	}
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent,
	publishToMultipleRelays
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair
}));

vi.mock('$lib/nostr/nip44', () => ({
	default: {
		getConversationKey,
		encrypt
	}
}));

describe('service quote notification helpers', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_CLIENT_URL', 'https://bittasker.test');
		window.localStorage.clear();

		sendNotificationToNpubs.mockResolvedValue(undefined);
		getSignedEvent.mockResolvedValue({ id: 'dm-event-id' });
		publishToMultipleRelays.mockResolvedValue([{ relay: 'wss://relay.example', success: true }]);
		getNostrKeyPair.mockResolvedValue({ nsec: new Uint8Array([1, 2, 3]) });
		getConversationKey.mockResolvedValue(new Uint8Array([7, 8, 9]));
		encrypt.mockResolvedValue('encrypted-dm');

		const { resetServiceQuoteSideEffectLedger } = await import(
			'$lib/utils/service-quote/notifications'
		);
		resetServiceQuoteSideEffectLedger();
	});

	it('sends provider inquiry notifications to the exact request focus and dedupes retries', async () => {
		const { dispatchQuoteRequestPublishedSideEffects } = await import(
			'$lib/utils/service-quote/notifications'
		);

		const requestEvent = {
			id: 'request-event-id',
			tags: [['p', 'a'.repeat(64)]],
			content: {
				serviceAddress: `30402:${'a'.repeat(64)}:service-123`,
				quoteRequestId: 'qr_valid123'
			}
		} as any;

		dispatchQuoteRequestPublishedSideEffects(requestEvent, { title: 'Premium logo package' });
		dispatchQuoteRequestPublishedSideEffects(requestEvent, { title: 'Premium logo package' });

		await vi.waitFor(() => {
			expect(sendNotificationToNpubs).toHaveBeenCalledTimes(1);
		});

		const call = sendNotificationToNpubs.mock.calls[0][0];
		expect(call.title).toBe('New service inquiry received');
		expect(call.body).toContain('Premium logo package');
		const url = new URL(call.clickAction);
		expect(url.pathname).toBe('/dashboard');
		expect(url.searchParams.get('tab')).toBe('my-services');
		expect(url.searchParams.get('view')).toBe('quotes');
		expect(decodeURIComponent(url.searchParams.get('service') ?? '')).toBe(
			requestEvent.content.serviceAddress
		);
		expect(url.searchParams.get('request')).toBe('qr_valid123');
	});

	it('sends optional proposal DM mirrors with canonical tags and keeps push non-blocking on failure', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		publishToMultipleRelays.mockResolvedValueOnce([{ relay: 'wss://relay.example', success: false }]);

		const { dispatchProposalPublishedSideEffects } = await import(
			'$lib/utils/service-quote/notifications'
		);

		const proposalEvent = {
			id: 'proposal-event-id',
			tags: [['p', 'b'.repeat(64)]],
			content: {
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceAddress: `30402:${'a'.repeat(64)}:service-123`
			}
		} as any;

		dispatchProposalPublishedSideEffects(proposalEvent, { dmMirror: true });

		await vi.waitFor(() => {
			expect(sendNotificationToNpubs).toHaveBeenCalledTimes(1);
			expect(getSignedEvent).toHaveBeenCalledTimes(1);
		});

		expect(getSignedEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 4,
				content: 'encrypted-dm',
				tags: expect.arrayContaining([
					['p', 'b'.repeat(64)],
					['m', 'service-quote-mirror'],
					['a', proposalEvent.content.serviceAddress],
					['e', 'proposal-event-id', '', 'root']
				])
			})
		);
		await vi.waitFor(() => {
			expect(warnSpy).toHaveBeenCalledWith(
				'Failed to send service proposal DM mirror',
				expect.any(Error)
			);
		});
		warnSpy.mockRestore();
	});

	it('reuses the shared contract-created foundation for service contracts', async () => {
		const { dispatchServiceContractCreatedNotification } = await import(
			'$lib/utils/service-quote/notifications'
		);

		dispatchServiceContractCreatedNotification({
			recipientPubkey: 'c'.repeat(64),
			escrowId: 'svc-123',
			serviceTitle: 'Migration audit',
			purchaseMode: 'instant_buy'
		});

		await vi.waitFor(() => {
			expect(sendNotificationToNpubs).toHaveBeenCalledTimes(1);
		});

		expect(sendNotificationToNpubs).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'contract_created',
				title: 'New service contract created for Migration audit',
				body: 'A buyer placed an instant-buy order for Migration audit.',
				clickAction:
					'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-123'
			})
		);
	});
});
