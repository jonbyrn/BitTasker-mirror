import type { ServiceProposalEvent, ServiceQuoteRequestEvent } from '$lib/types/service-quote';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotificationToNpubs = vi.fn();
const getSignedEvent = vi.fn();
const publishToMultipleRelays = vi.fn();
const getNostrKeyPair = vi.fn();
const getConversationKey = vi.fn();
const encrypt = vi.fn();
const debugWarn = vi.fn();

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: debugWarn,
		error: vi.fn(),
		extend: vi.fn(() => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }))
	})
}));

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

vi.mock('nostr-tools', () => ({
	nip44: {
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

	it('does not send client-side push notifications (handled by backend)', async () => {
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
		} as ServiceQuoteRequestEvent;

		dispatchQuoteRequestPublishedSideEffects(requestEvent, { title: 'Premium logo package' });

		await new Promise((r) => setTimeout(r, 50));
		expect(sendNotificationToNpubs).toHaveBeenCalledTimes(0);
	});

	it('sends optional proposal DM mirrors with canonical tags and logs on failure', async () => {
		publishToMultipleRelays.mockResolvedValueOnce([
			{ relay: 'wss://relay.example', success: false }
		]);

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
		} as ServiceProposalEvent;

		dispatchProposalPublishedSideEffects(proposalEvent, { dmMirror: true });

		await vi.waitFor(() => {
			expect(getSignedEvent).toHaveBeenCalledTimes(1);
		});

		expect(sendNotificationToNpubs).toHaveBeenCalledTimes(0);

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
			expect(debugWarn).toHaveBeenCalledWith(
				'Failed to send service proposal DM mirror',
				expect.any(Error)
			);
		});
	});
});
