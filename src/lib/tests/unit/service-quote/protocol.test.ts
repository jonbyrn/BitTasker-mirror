import { describe, expect, it } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';
import {
	buildProposalD,
	buildProposalStatusD,
	buildQuoteRequestD,
	buildServiceAddress,
	buildServiceAddressFromParts,
	canPublishAcceptedStatus,
	parseProposalD,
	parseProposalStatusD,
	parseQuoteRequestD,
	parseServiceAddress,
	resolveProposalState,
	selectProposalPublishRelays,
	validateStatusAuthorRole,
	validateServiceProposalEvent,
	validateServiceProposalStatusEvent,
	validateServiceQuoteRequestEvent
} from '$lib/utils/service-quote/protocol';

const servicePubkey = 'a'.repeat(64);
const taskerPubkey = 'b'.repeat(64);
const serviceAddress = buildServiceAddressFromParts(30402, servicePubkey, 'service-1234');

function createAcceptanceSnapshot(overrides: Record<string, unknown> = {}) {
	return {
		clientRskAddress: '0x3333333333333333333333333333333333333333',
		clientFeeTier: 1,
		freelancerRskAddress: '0x1111111111111111111111111111111111111111',
		freelancerFeeTier: 1,
		chainId: 31,
		contractAddress: '0x2222222222222222222222222222222222222222',
		conversionFormulaVersion: 'v1',
		conversionSnapshotId: 'snapshot-protocol',
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

function createProposalEvent() {
	return validateServiceProposalEvent({
		id: '2'.repeat(64),
		kind: KINDS.SERVICE_PROPOSAL,
		pubkey: servicePubkey,
		created_at: 1_700_000_100,
		tags: [
			['d', buildProposalD('qr_valid123', 'pr_valid123')],
			['p', taskerPubkey],
			['m', 'service-proposal'],
			['a', serviceAddress],
			['z', 'v1'],
			['n', 'testnet'],
			['e', 'request-event-id'],
			['expiration', String(1_700_259_300)],
			['t', serviceAddress]
		],
		content: JSON.stringify({
			type: 'service-proposal',
			proposalId: 'pr_valid123',
			quoteRequestId: 'qr_valid123',
			serviceId: serviceAddress,
			serviceAddress,
			paymentType: 'FIXED',
			amountUsdt: '125.00',
			description: 'Migration plus redirect validation.',
			estimatedDuration: '3 days',
			estimatedStartTime: 1_700_010_000,
			estimatedEndTime: 1_700_269_200,
			expirationDays: 3,
			expirationHours: 0,
			expirationTimestamp: 1_700_259_300,
			freelancerRskAddress: '0x1111111111111111111111111111111111111111',
			freelancerFeeTier: 1,
			pricingSnapshot: {
				serviceVersionRef: 'service-event-id'
			},
			timestamp: 1_700_000_100,
			version: 'v1'
		}),
		sig: 'sig'
	});
}

function createStatusEvent(
	status: 'accepting' | 'contract_sync_pending' | 'accepted' | 'accept_unknown',
	overrides: Record<string, unknown> = {}
) {
	const acceptedDefaults =
		status === 'accepted' || status === 'contract_sync_pending'
			? {
					escrowId: 'escrow-123',
					transactionHash: '0x' + 'c'.repeat(64),
					acceptanceSnapshot: createAcceptanceSnapshot()
				}
			: {};
	return validateServiceProposalStatusEvent(
		{
			id: `${status}-${String(overrides.timestamp ?? 1_700_000_200)}`,
			kind: KINDS.SERVICE_PROPOSAL_STATUS,
			pubkey: taskerPubkey,
			created_at: Number(overrides.timestamp ?? 1_700_000_200),
			tags: [
				['d', buildProposalStatusD('pr_valid123', status, taskerPubkey)],
				['p', servicePubkey],
				['m', 'service-proposal-status'],
				['s', status],
				['a', serviceAddress],
				['z', 'v1'],
				['n', 'testnet'],
				['e', 'proposal-event-id'],
				['t', serviceAddress]
			],
			content: JSON.stringify({
				type: 'service-proposal-status',
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: serviceAddress,
				serviceAddress,
				status,
				actorPubkey: taskerPubkey,
				timestamp: Number(overrides.timestamp ?? 1_700_000_200),
				version: 'v1',
				...acceptedDefaults,
				...overrides
			}),
			sig: 'sig'
		},
		1_700_000_260
	);
}

describe('service-quote protocol', () => {
	it('round-trips service addresses and d-tags', () => {
		expect(parseServiceAddress(serviceAddress)).toEqual({
			kind: 30402,
			pubkey: servicePubkey,
			dTag: 'service-1234'
		});

		const requestD = buildQuoteRequestD(serviceAddress, 'qr_valid123');
		expect(parseQuoteRequestD(requestD)).toEqual({
			serviceAddress,
			quoteRequestId: 'qr_valid123'
		});

		const proposalD = buildProposalD('qr_valid123', 'pr_valid123');
		expect(parseProposalD(proposalD)).toEqual({
			quoteRequestId: 'qr_valid123',
			proposalId: 'pr_valid123'
		});

		const statusD = buildProposalStatusD('pr_valid123', 'accepting', taskerPubkey);
		expect(parseProposalStatusD(statusD)).toEqual({
			proposalId: 'pr_valid123',
			status: 'accepting',
			actorPubkey: taskerPubkey
		});
	});

	it('uses the backing event kind when building service addresses for inactive published listings', () => {
		expect(
			buildServiceAddress({
				npub: servicePubkey,
				uniqueId: 'service-1234',
				status: 'inactive',
				eventKind: KINDS.SERVICE_ACTIVE
			})
		).toBe(serviceAddress);
	});

	it('validates canonical quote request events and rejects recipient drift', () => {
		const event = {
			id: '1'.repeat(64),
			kind: KINDS.SERVICE_QUOTE_REQUEST,
			pubkey: taskerPubkey,
			created_at: 1_700_000_000,
			tags: [
				['d', buildQuoteRequestD(serviceAddress, 'qr_valid123')],
				['p', servicePubkey],
				['m', 'service-quote-request'],
				['a', serviceAddress],
				['z', 'v1'],
				['n', 'testnet'],
				['t', serviceAddress]
			],
			content: JSON.stringify({
				type: 'service-quote-request',
				quoteRequestId: 'qr_valid123',
				serviceId: serviceAddress,
				serviceAddress,
				pricingType: 'INQUIRY_REQUIRED',
				inquiry: {
					title: 'Need a migration plan',
					description: 'Audit the current redirects and rewrite rules.'
				},
				timestamp: 1_700_000_000,
				version: 'v1'
			}),
			sig: 'sig'
		};

		expect(validateServiceQuoteRequestEvent(event).content.quoteRequestId).toBe('qr_valid123');

		const invalidRecipientEvent = {
			...event,
			tags: event.tags.map((tag) => (tag[0] === 'p' ? ['p', taskerPubkey] : tag))
		};

		expect(() => validateServiceQuoteRequestEvent(invalidRecipientEvent)).toThrow(
			/service owner pubkey/
		);
	});

	it('validates proposals and enforces amount plus expiration invariants', () => {
		const proposalEvent = {
			id: '2'.repeat(64),
			kind: KINDS.SERVICE_PROPOSAL,
			pubkey: servicePubkey,
			created_at: 1_700_000_100,
			tags: [
				['d', buildProposalD('qr_valid123', 'pr_valid123')],
				['p', taskerPubkey],
				['m', 'service-proposal'],
				['a', serviceAddress],
				['z', 'v1'],
				['n', 'testnet'],
				['e', 'request-event-id'],
				['expiration', String(1_700_259_300)],
				['t', serviceAddress]
			],
			content: JSON.stringify({
				type: 'service-proposal',
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: serviceAddress,
				serviceAddress,
				paymentType: 'FIXED',
				amountUsdt: '125.00',
				description: 'Migration plus redirect validation.',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_010_000,
				estimatedEndTime: 1_700_269_200,
				expirationDays: 3,
				expirationHours: 0,
				expirationTimestamp: 1_700_259_300,
				freelancerRskAddress: '0x1111111111111111111111111111111111111111',
				freelancerFeeTier: 1,
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id'
				},
				timestamp: 1_700_000_100,
				version: 'v1'
			}),
			sig: 'sig'
		};

		expect(validateServiceProposalEvent(proposalEvent).content.amountUsdt).toBe('125.00');

		const invalidAmountEvent = {
			...proposalEvent,
			content: JSON.stringify({
				...JSON.parse(proposalEvent.content),
				amountUsdt: '125'
			})
		};

		expect(validateServiceProposalEvent(invalidAmountEvent).content.amountUsdt).toBe('125');

		const tooPreciseAmountEvent = {
			...proposalEvent,
			content: JSON.stringify({
				...JSON.parse(proposalEvent.content),
				amountUsdt: '125.999'
			})
		};

		expect(() => validateServiceProposalEvent(tooPreciseAmountEvent)).toThrow(
			/up to 2 decimal places/
		);
	});

	it('validates status events and gates accepted status publishing behind the feature flag', () => {
		const statusEvent = {
			id: '3'.repeat(64),
			kind: KINDS.SERVICE_PROPOSAL_STATUS,
			pubkey: taskerPubkey,
			created_at: 1_700_000_200,
			tags: [
				['d', buildProposalStatusD('pr_valid123', 'accepting', taskerPubkey)],
				['p', servicePubkey],
				['m', 'service-proposal-status'],
				['s', 'accepting'],
				['a', serviceAddress],
				['z', 'v1'],
				['n', 'testnet'],
				['e', 'proposal-event-id'],
				['t', serviceAddress]
			],
			content: JSON.stringify({
				type: 'service-proposal-status',
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: serviceAddress,
				serviceAddress,
				status: 'accepting',
				actorPubkey: taskerPubkey,
				timestamp: 1_700_000_200,
				version: 'v1'
			}),
			sig: 'sig'
		};

		expect(validateServiceProposalStatusEvent(statusEvent, 1_700_000_220).content.status).toBe(
			'accepting'
		);
		expect(() => canPublishAcceptedStatus(false, 'accepted')).toThrow(/disabled/);
		expect(() => canPublishAcceptedStatus(true, 'accepted')).not.toThrow();
		expect(() =>
			validateStatusAuthorRole('withdrawn', taskerPubkey, taskerPubkey, servicePubkey)
		).toThrow(/taskee/);
		expect(() =>
			validateStatusAuthorRole('declined', taskerPubkey, taskerPubkey, servicePubkey)
		).not.toThrow();
	});

	it('rejects accepted status events without a valid acceptance snapshot payload', () => {
		expect(() =>
			createStatusEvent('accepted', {
				acceptanceSnapshot: undefined
			})
		).toThrow(/acceptance snapshot/);

		expect(() =>
			createStatusEvent('accepted', {
				acceptanceSnapshot: createAcceptanceSnapshot({
					sourceTimestamp: undefined
				})
			})
		).toThrow(/acceptance snapshot/);

		expect(() =>
			createStatusEvent('accepted', {
				acceptanceSnapshot: createAcceptanceSnapshot({
					finalityPolicyVersion: 'wrong-policy'
				})
			})
		).toThrow(/acceptance snapshot/);
	});

	it('selects compatible relay targets and fails closed when every relay opts out of NIP-40', () => {
		expect(
			selectProposalPublishRelays([
				{ relay: 'wss://relay-1.example', state: 'supports_40', supportedNips: [40, 44] },
				{ relay: 'wss://relay-2.example', state: 'unknown' },
				{ relay: 'wss://relay-3.example', state: 'explicit_no_40', supportedNips: [44] }
			])
		).toEqual(['wss://relay-1.example', 'wss://relay-2.example']);

		expect(() =>
			selectProposalPublishRelays([
				{ relay: 'wss://relay-3.example', state: 'explicit_no_40', supportedNips: [44] }
			])
		).toThrow(/No compatible relay/);
	});

	it('allows accepted proposals to downgrade to accept_unknown and later reconfirm on the same lineage', () => {
		const proposal = createProposalEvent();
		const acceptedStatus = createStatusEvent('accepted', {
			timestamp: 1_700_000_180,
			escrowId: 'escrow-123',
			transactionHash: '0x' + 'd'.repeat(64),
			acceptanceSnapshot: createAcceptanceSnapshot({
				conversionSnapshotId: 'snapshot-accepted'
			})
		});
		const unknownStatus = createStatusEvent('accept_unknown', {
			timestamp: 1_700_000_190,
			reasonCode: 'reconciliation_deferred',
			transactionHash: '0x' + 'd'.repeat(64)
		});
		const reconfirmedStatus = createStatusEvent('accepted', {
			timestamp: 1_700_000_200,
			escrowId: 'escrow-123',
			transactionHash: '0x' + 'd'.repeat(64),
			acceptanceSnapshot: createAcceptanceSnapshot({
				conversionSnapshotId: 'snapshot-accepted'
			})
		});

		const downgraded = resolveProposalState(
			proposal,
			[acceptedStatus, unknownStatus],
			1_700_000_250
		);
		expect(downgraded.state).toBe('accept_unknown');
		expect(downgraded.winningStatus).toBeUndefined();
		expect(downgraded.linkedEscrowId).toBe('escrow-123');

		const reconfirmed = resolveProposalState(
			proposal,
			[acceptedStatus, unknownStatus, reconfirmedStatus],
			1_700_000_250
		);
		expect(reconfirmed.state).toBe('accepted');
		expect(reconfirmed.winningStatus?.id).toBe(reconfirmedStatus.id);
		expect(reconfirmed.linkedEscrowId).toBe('escrow-123');
	});

	it('preserves escrow linkage while an accepted proposal is still syncing to the contract store', () => {
		const proposal = createProposalEvent();
		const acceptedStatus = createStatusEvent('accepted', {
			timestamp: 1_700_000_180,
			escrowId: 'escrow-123',
			transactionHash: '0x' + 'd'.repeat(64)
		});
		const syncingStatus = createStatusEvent('contract_sync_pending', {
			timestamp: 1_700_000_190,
			escrowId: 'escrow-123',
			transactionHash: '0x' + 'd'.repeat(64),
			message: 'Contract syncing'
		});

		const resolved = resolveProposalState(proposal, [acceptedStatus, syncingStatus], 1_700_000_250);

		expect(resolved.state).toBe('contract_sync_pending');
		expect(resolved.winningStatus).toBeUndefined();
		expect(resolved.linkedEscrowId).toBe('escrow-123');
		expect(resolved.linkedTransactionHash).toBe('0x' + 'd'.repeat(64));
	});
});
