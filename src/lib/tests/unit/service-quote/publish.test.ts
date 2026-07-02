import { beforeEach, describe, expect, it, vi } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';
import type { ServiceProposalStatusContent } from '$lib/types/service-quote';

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
const encrypt = vi.fn();
const getConversationKey = vi.fn();
const dispatchQuoteRequestPublishedSideEffects = vi.fn();
const dispatchProposalPublishedSideEffects = vi.fn();

function createAcceptanceSnapshot(overrides: Record<string, unknown> = {}) {
	return {
		clientRskAddress: '0x3333333333333333333333333333333333333333',
		clientFeeTier: 1,
		freelancerRskAddress: '0x1111111111111111111111111111111111111111',
		freelancerFeeTier: 1,
		chainId: 31,
		contractAddress: '0x2222222222222222222222222222222222222222',
		conversionFormulaVersion: 'v1',
		conversionSnapshotId: 'snapshot-publish',
		btcUsdRateMicros: 100_000_000_000,
		sourceTimestamp: 1_700_000_190,
		requiredConfirmations: 3,
		finalityPolicyVersion: 'rsk_rootstock_default_v1',
		sats: '125000',
		weiAmount: '1250000000000000',
		confirmationsAtVerification: 3,
		verificationRpc: 'rsk:testnet',
		...overrides
	};
}

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

vi.mock('$lib/utils/service-quote/notifications', () => ({
	dispatchQuoteRequestPublishedSideEffects,
	dispatchProposalPublishedSideEffects
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

const service = {
	id: 'service-event-id',
	npub: 'a'.repeat(64),
	uniqueId: 'service-1234',
	status: 'active',
	title: 'Migration audit',
	description: 'Preserve redirects and SEO equity.',
	serviceLocationTypes: [],
	pricing: {
		type: 'INQUIRY_REQUIRED',
		currency: 'USDt'
	},
	skills: [],
	categories: [],
	createdAt: 1
} as const;

const quoteRequestEvent = {
	id: 'request-event-id',
	kind: KINDS.SERVICE_QUOTE_REQUEST,
	pubkey: 'b'.repeat(64),
	created_at: 1_700_000_000,
	tags: [['p', service.npub]],
	content: {
		quoteRequestId: 'qr_valid123',
		serviceId: `30402:${service.npub}:${service.uniqueId}`,
		serviceAddress: `30402:${service.npub}:${service.uniqueId}`
	},
	sig: 'sig'
};

const proposalEvent = {
	id: 'proposal-event-id',
	kind: KINDS.SERVICE_PROPOSAL,
	pubkey: service.npub,
	created_at: 1_700_000_100,
	tags: [],
	content: {
		proposalId: 'pr_valid123',
		quoteRequestId: 'qr_valid123',
		serviceAddress: `30402:${service.npub}:${service.uniqueId}`,
		expirationTimestamp: 1_700_259_300
	},
	sig: 'sig'
};

const statusEvent = {
	id: 'status-event-id',
	kind: KINDS.SERVICE_PROPOSAL_STATUS,
	pubkey: 'b'.repeat(64),
	created_at: 1_700_000_200,
	tags: [],
	content: {},
	sig: 'sig'
};

describe('service-quote publishing helpers', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.resetModules();
		window.localStorage.clear();
		getServiceQuoteFeatureFlags.mockReturnValue({
			read: true,
			write: true,
			accept: true,
			contractsFilter: true
		});
		getNpub.mockResolvedValue('b'.repeat(64));
		getNostrKeyPair.mockResolvedValue({
			nsec: 'nsec-test'
		});
		getServiceQuoteMessageType.mockReturnValue('service-quote-request');
		validateServiceQuoteRequestEvent.mockImplementation((event) => event);
		validateServiceProposalEvent.mockImplementation((event) => event);
		validateServiceProposalStatusEvent.mockImplementation((event) => event);
		detectRelayCapability.mockResolvedValue({ relay: 'wss://relay.example', state: 'supports_40' });
		selectProposalPublishRelays.mockReturnValue(['wss://relay.example']);
		getConversationKey.mockResolvedValue(new Uint8Array([1, 2, 3]));
		encrypt.mockResolvedValue('encrypted-content');
		getSignedEvent.mockResolvedValue({
			...proposalEvent,
			content: 'encrypted-content'
		});
		publishToMultipleRelays.mockResolvedValue([{ relay: 'wss://relay.example', success: true }]);
		canPublishAcceptedStatus.mockImplementation(() => undefined);
	});

	it('persists relay sets locally and reads them back safely', async () => {
		const { getPublishedRelaySet, persistPublishedRelaySet } = await import(
			'$lib/utils/service-quote/publish'
		);

		await expect(getPublishedRelaySet('request-event-id')).resolves.toEqual([]);
		persistPublishedRelaySet('request-event-id', ['wss://relay.example']);
		await expect(getPublishedRelaySet('request-event-id')).resolves.toEqual([
			'wss://relay.example'
		]);

		window.localStorage.setItem('bittasker.serviceQuote.publishedRelays', '{not-json');
		await expect(getPublishedRelaySet('missing-event-id')).resolves.toEqual([]);
	});

	it('finds duplicates from primary identifier queries and fallback history scans', async () => {
		const { findExistingDuplicate } = await import('$lib/utils/service-quote/publish');

		queryNostrEvents.mockResolvedValueOnce([quoteRequestEvent]);
		await expect(
			findExistingDuplicate(KINDS.SERVICE_QUOTE_REQUEST, 'b'.repeat(64), 'd-tag')
		).resolves.toEqual(quoteRequestEvent);

		queryNostrEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([
			{
				id: 'fallback-event-id',
				tags: [['d', 'd-tag']]
			}
		]);

		await expect(
			findExistingDuplicate(KINDS.SERVICE_QUOTE_REQUEST, 'b'.repeat(64), 'd-tag')
		).resolves.toEqual({
			id: 'fallback-event-id',
			tags: [['d', 'd-tag']]
		});
	});

	it('publishes encrypted quote requests and persists successful relay sets', async () => {
		const { publishServiceQuoteRequest, getPublishedRelaySet } = await import(
			'$lib/utils/service-quote/publish'
		);

		queryNostrEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
		getSignedEvent.mockResolvedValueOnce({
			...quoteRequestEvent,
			content: 'encrypted-content'
		});
		publishToMultipleRelays.mockResolvedValueOnce([
			{ relay: 'wss://relay-1.example', success: true },
			{ relay: 'wss://relay-2.example', success: false, error: 'timeout' }
		]);

		const result = await publishServiceQuoteRequest({
			service: service as never,
			payload: {
				title: 'Need a migration audit',
				description: 'Redirect inventory and rollout plan.'
			},
			quoteRequestId: 'qr_valid123'
		});

		expect(getSignedEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: KINDS.SERVICE_QUOTE_REQUEST,
				content: 'encrypted-content',
				created_at: expect.any(Number),
				tags: expect.arrayContaining([
					['p', service.npub],
					['m', 'service-quote-request']
				])
			})
		);
		const requestSignCall = getSignedEvent.mock.calls[0]?.[0];
		const requestPayload = JSON.parse(encrypt.mock.calls[0]?.[0] as string);
		expect(requestSignCall?.created_at).toBe(requestPayload.timestamp);
		expect(encrypt).toHaveBeenCalledWith(
			expect.stringContaining('"quoteRequestId":"qr_valid123"'),
			expect.any(Uint8Array),
			expect.any(Uint8Array)
		);
		expect(publishToMultipleRelays).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: KINDS.SERVICE_QUOTE_REQUEST
			}),
			expect.any(Array)
		);
		expect(validateServiceQuoteRequestEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'request-event-id',
				content: expect.objectContaining({
					quoteRequestId: 'qr_valid123',
					type: 'service-quote-request'
				})
			})
		);
		expect(result.publishedRelaySet).toEqual(['wss://relay-1.example']);
		await expect(getPublishedRelaySet('request-event-id')).resolves.toEqual([
			'wss://relay-1.example'
		]);
	});

	it('publishes encrypted proposals once relay quorum is reached', async () => {
		const { publishServiceProposal, getPublishedRelaySet } = await import(
			'$lib/utils/service-quote/publish'
		);

		queryNostrEvents
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([quoteRequestEvent]);

		const result = await publishServiceProposal({
			content: {
				type: 'service-proposal',
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: `30402:${service.npub}:${service.uniqueId}`,
				serviceAddress: `30402:${service.npub}:${service.uniqueId}`,
				paymentType: 'FIXED',
				amountUsdt: '125.00',
				description: 'Migration plus redirect validation.',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_010_000,
				estimatedEndTime: 1_700_269_200,
				expirationDays: 3,
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

		expect(getSignedEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: KINDS.SERVICE_PROPOSAL,
				content: 'encrypted-content',
				created_at: 1_700_000_100
			})
		);
		expect(publishToMultipleRelays).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: KINDS.SERVICE_PROPOSAL
			}),
			['wss://relay.example']
		);
		expect(validateServiceProposalEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'proposal-event-id',
				content: expect.objectContaining({
					proposalId: 'pr_valid123',
					type: 'service-proposal'
				})
			})
		);
		expect(result.publishedRelaySet).toEqual(['wss://relay.example']);
		await expect(getPublishedRelaySet('proposal-event-id')).resolves.toEqual([
			'wss://relay.example'
		]);
	});

	it('publishes proposal statuses after accepted-status gating passes', async () => {
		const { publishServiceProposalStatus, getPublishedRelaySet } = await import(
			'$lib/utils/service-quote/publish'
		);

		queryNostrEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
		getSignedEvent.mockResolvedValueOnce({
			...statusEvent,
			content: 'encrypted-content'
		});
		publishToMultipleRelays.mockResolvedValueOnce([
			{ relay: 'wss://relay.example', success: true }
		]);

		const result = await publishServiceProposalStatus({
			content: {
				type: 'service-proposal-status',
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: `30402:${service.npub}:${service.uniqueId}`,
				serviceAddress: `30402:${service.npub}:${service.uniqueId}`,
				status: 'accepted',
				actorPubkey: 'b'.repeat(64),
				escrowId: 'escrow-123',
				transactionHash: '0x' + 'c'.repeat(64),
				acceptanceSnapshot: createAcceptanceSnapshot(),
				timestamp: 1_700_000_200,
				version: 'v1'
			} as unknown as ServiceProposalStatusContent,
			proposalEventId: 'proposal-event-id',
			counterpartyPubkey: service.npub,
			taskerPubkey: 'b'.repeat(64),
			taskeePubkey: service.npub,
			relays: ['wss://relay.example']
		});

		expect(canPublishAcceptedStatus).toHaveBeenCalledWith(true, 'accepted');
		expect(getSignedEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: KINDS.SERVICE_PROPOSAL_STATUS,
				content: 'encrypted-content',
				created_at: 1_700_000_200,
				tags: expect.arrayContaining([['s', 'accepted']])
			})
		);
		const statusPayload = JSON.parse(encrypt.mock.calls.at(-1)?.[0] as string);
		expect(statusPayload.timestamp).toBe(1_700_000_200);
		expect(publishToMultipleRelays).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: KINDS.SERVICE_PROPOSAL_STATUS
			}),
			['wss://relay.example']
		);
		expect(validateServiceProposalStatusEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'status-event-id',
				content: expect.objectContaining({
					status: 'accepted',
					type: 'service-proposal-status'
				})
			})
		);
		expect(result.publishedRelaySet).toEqual(['wss://relay.example']);
		await expect(getPublishedRelaySet('status-event-id')).resolves.toEqual(['wss://relay.example']);
	});

	it('fails closed before publish when accepted status metadata is incomplete', async () => {
		const { publishServiceProposalStatus } = await import('$lib/utils/service-quote/publish');

		await expect(
			publishServiceProposalStatus({
				content: {
					type: 'service-proposal-status',
					proposalId: 'pr_valid123',
					quoteRequestId: 'qr_valid123',
					serviceId: `30402:${service.npub}:${service.uniqueId}`,
					serviceAddress: `30402:${service.npub}:${service.uniqueId}`,
					status: 'accepted',
					actorPubkey: 'b'.repeat(64),
					escrowId: 'escrow-123',
					transactionHash: '0x' + 'c'.repeat(64),
					timestamp: 1_700_000_200,
					version: 'v1'
				},
				proposalEventId: 'proposal-event-id',
				counterpartyPubkey: service.npub,
				taskerPubkey: 'b'.repeat(64),
				taskeePubkey: service.npub,
				relays: ['wss://relay.example']
			})
		).rejects.toThrow(/acceptance snapshot/);

		await expect(
			publishServiceProposalStatus({
				content: {
					type: 'service-proposal-status',
					proposalId: 'pr_valid123',
					quoteRequestId: 'qr_valid123',
					serviceId: `30402:${service.npub}:${service.uniqueId}`,
					serviceAddress: `30402:${service.npub}:${service.uniqueId}`,
					status: 'accepted',
					actorPubkey: 'b'.repeat(64),
					escrowId: 'escrow-123',
					transactionHash: '0x' + 'c'.repeat(64),
					acceptanceSnapshot: createAcceptanceSnapshot({
						sourceTimestamp: undefined
					}),
					timestamp: 1_700_000_200,
					version: 'v1'
				} as unknown as ServiceProposalStatusContent,
				proposalEventId: 'proposal-event-id',
				counterpartyPubkey: service.npub,
				taskerPubkey: 'b'.repeat(64),
				taskeePubkey: service.npub,
				relays: ['wss://relay.example']
			})
		).rejects.toThrow(/acceptance snapshot/);

		expect(getSignedEvent).not.toHaveBeenCalled();
	});

	it('rejects proposal publish when the linked request does not match the supplied linkage context', async () => {
		const { publishServiceProposal } = await import('$lib/utils/service-quote/publish');

		queryNostrEvents
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([
				{
					...quoteRequestEvent,
					content: {
						...quoteRequestEvent.content,
						quoteRequestId: 'qr_other123'
					}
				}
			]);

		await expect(
			publishServiceProposal({
				content: {
					type: 'service-proposal',
					proposalId: 'pr_valid123',
					quoteRequestId: 'qr_valid123',
					serviceId: `30402:${service.npub}:${service.uniqueId}`,
					serviceAddress: `30402:${service.npub}:${service.uniqueId}`,
					paymentType: 'FIXED',
					amountUsdt: '125.00',
					description: 'Migration plus redirect validation.',
					estimatedDuration: '3 days',
					estimatedStartTime: 1_700_010_000,
					estimatedEndTime: 1_700_269_200,
					expirationDays: 3,
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
			})
		).rejects.toThrow(/linked quote request/);

		expect(getSignedEvent).not.toHaveBeenCalled();
	});

	it('skips duplicate proposal and status publish attempts using canonical d tags', async () => {
		const { publishServiceProposal, publishServiceProposalStatus } = await import(
			'$lib/utils/service-quote/publish'
		);

		queryNostrEvents.mockResolvedValueOnce([proposalEvent]);

		const duplicateProposal = await publishServiceProposal({
			content: {
				type: 'service-proposal',
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: `30402:${service.npub}:${service.uniqueId}`,
				serviceAddress: `30402:${service.npub}:${service.uniqueId}`,
				paymentType: 'FIXED',
				amountUsdt: '125.00',
				description: 'Migration plus redirect validation.',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_010_000,
				estimatedEndTime: 1_700_269_200,
				expirationDays: 3,
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

		expect(duplicateProposal.duplicateOf).toBe('proposal-event-id');
		expect(getSignedEvent).not.toHaveBeenCalled();

		vi.clearAllMocks();
		queryNostrEvents.mockResolvedValueOnce([statusEvent]);

		const duplicateStatus = await publishServiceProposalStatus({
			content: {
				type: 'service-proposal-status',
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: `30402:${service.npub}:${service.uniqueId}`,
				serviceAddress: `30402:${service.npub}:${service.uniqueId}`,
				status: 'declined',
				actorPubkey: 'b'.repeat(64),
				timestamp: 1_700_000_200,
				version: 'v1'
			},
			proposalEventId: 'proposal-event-id',
			counterpartyPubkey: service.npub,
			taskerPubkey: 'b'.repeat(64),
			taskeePubkey: service.npub,
			relays: ['wss://relay.example']
		});

		expect(duplicateStatus.duplicateOf).toBe('status-event-id');
		expect(getSignedEvent).not.toHaveBeenCalled();
	});

	it('rejects status publish when the actor role does not match the canonical tasker/taskee mapping', async () => {
		const { publishServiceProposalStatus } = await import('$lib/utils/service-quote/publish');

		await expect(
			publishServiceProposalStatus({
				content: {
					type: 'service-proposal-status',
					proposalId: 'pr_valid123',
					quoteRequestId: 'qr_valid123',
					serviceId: `30402:${service.npub}:${service.uniqueId}`,
					serviceAddress: `30402:${service.npub}:${service.uniqueId}`,
					status: 'withdrawn',
					actorPubkey: 'b'.repeat(64),
					timestamp: 1_700_000_200,
					version: 'v1'
				},
				proposalEventId: 'proposal-event-id',
				counterpartyPubkey: service.npub,
				taskerPubkey: 'b'.repeat(64),
				taskeePubkey: service.npub,
				relays: ['wss://relay.example']
			})
		).rejects.toThrow(/must be authored by the taskee|canonical counterparty/);

		expect(getSignedEvent).not.toHaveBeenCalled();
	});
});
