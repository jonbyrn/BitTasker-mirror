import { describe, expect, it } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';
import type {
	ServiceQuoteRequestEvent,
	ServiceProposalEvent,
	ServiceProposalStatusEvent
} from '$lib/types/service-quote';
import {
	buildProposalD,
	buildProposalStatusD,
	buildQuoteRequestD,
	buildServiceAddressFromParts
} from '$lib/utils/service-quote/protocol';
import {
	isProposalLinkedToRequest,
	isDeleteBlockingTimelineEntry,
	isStatusLinkedToProposal,
	resolveServiceQuoteThreads,
	summarizeDeleteGuardForThreads,
	summarizeDeleteGuardForTimelines
} from '$lib/utils/service-quote/resolver';

const taskeePubkey = 'a'.repeat(64);
const taskerPubkey = 'b'.repeat(64);
const serviceAddress = buildServiceAddressFromParts(30402, taskeePubkey, 'service-1234');

function createAcceptanceSnapshot(overrides: Record<string, unknown> = {}) {
	return {
		clientRskAddress: '0x3333333333333333333333333333333333333333',
		clientFeeTier: 1,
		freelancerRskAddress: '0x1111111111111111111111111111111111111111',
		freelancerFeeTier: 1,
		chainId: 31,
		contractAddress: '0x2222222222222222222222222222222222222222',
		conversionFormulaVersion: 'v1',
		conversionSnapshotId: 'snapshot-resolver',
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

function createRequest(): ServiceQuoteRequestEvent {
	return {
		id: 'request-event-id',
		kind: KINDS.SERVICE_QUOTE_REQUEST,
		pubkey: taskerPubkey,
		created_at: 1_700_000_000,
		tags: [
			['d', buildQuoteRequestD(serviceAddress, 'qr_valid123')],
			['p', taskeePubkey],
			['m', 'service-quote-request'],
			['a', serviceAddress],
			['z', 'v1'],
			['n', 'testnet'],
			['t', serviceAddress]
		],
		content: {
			type: 'service-quote-request',
			quoteRequestId: 'qr_valid123',
			serviceId: serviceAddress,
			serviceAddress,
			pricingType: 'INQUIRY_REQUIRED',
			inquiry: {
				title: 'Need a migration',
				description: 'Move the content and preserve SEO equity.'
			},
			timestamp: 1_700_000_000,
			version: 'v1'
		},
		sig: 'sig'
	} as unknown as ServiceQuoteRequestEvent;
}

function createProposal(): ServiceProposalEvent {
	return {
		id: 'proposal-event-id',
		kind: KINDS.SERVICE_PROPOSAL,
		pubkey: taskeePubkey,
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
		content: {
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
		},
		sig: 'sig'
	} as unknown as ServiceProposalEvent;
}

function createStatus(
	status:
		| 'accepting'
		| 'contract_sync_pending'
		| 'accepted'
		| 'withdrawn'
		| 'declined'
		| 'accept_unknown'
		| 'accept_failed',
	overrides: Record<string, unknown> = {}
): ServiceProposalStatusEvent {
	const actorPubkey = status === 'withdrawn' ? taskeePubkey : taskerPubkey;
	const recipientPubkey = status === 'withdrawn' ? taskerPubkey : taskeePubkey;
	const acceptedDefaults =
		status === 'accepted' || status === 'contract_sync_pending'
			? {
					escrowId: 'escrow-123',
					transactionHash: '0x' + 'c'.repeat(64),
					acceptanceSnapshot: createAcceptanceSnapshot()
				}
			: {};

	return {
		id: `${status}-event-id`,
		kind: KINDS.SERVICE_PROPOSAL_STATUS,
		pubkey: actorPubkey,
		created_at: 1_700_000_200,
		tags: [
			['d', buildProposalStatusD('pr_valid123', status, actorPubkey)],
			['p', recipientPubkey],
			['m', 'service-proposal-status'],
			['s', status],
			['a', serviceAddress],
			['z', 'v1'],
			['n', 'testnet'],
			['e', 'proposal-event-id'],
			['t', serviceAddress]
		],
		content: {
			type: 'service-proposal-status',
			proposalId: 'pr_valid123',
			quoteRequestId: 'qr_valid123',
			serviceId: serviceAddress,
			serviceAddress,
			status,
			actorPubkey,
			timestamp: 1_700_000_200,
			version: 'v1',
			...acceptedDefaults,
			...overrides
		},
		sig: 'sig'
	} as unknown as ServiceProposalStatusEvent;
}

describe('service-quote resolver', () => {
	it('links canonical proposal and accepted status threads to a request', () => {
		const request = createRequest();
		const proposal = createProposal();
		const acceptedStatus = createStatus('accepted', {
			escrowId: 'escrow-123',
			transactionHash: '0x' + 'a'.repeat(64),
			acceptanceSnapshot: createAcceptanceSnapshot({
				conversionSnapshotId: 'snapshot-thread'
			})
		});

		expect(isProposalLinkedToRequest(request, proposal)).toBe(true);
		expect(isStatusLinkedToProposal(request, proposal, acceptedStatus, 1_700_000_250)).toBe(true);

		const [thread] = resolveServiceQuoteThreads({
			requests: [request],
			proposals: [proposal],
			statuses: [acceptedStatus],
			now: 1_700_000_250
		});

		expect(thread.taskerPubkey).toBe(taskerPubkey);
		expect(thread.taskeePubkey).toBe(taskeePubkey);
		expect(thread.latestProposal?.state).toBe('accepted');
		expect(thread.linkedEscrowId).toBe('escrow-123');
		expect(thread.latestProposal?.linkedTransactionHash).toBe('0x' + 'a'.repeat(64));
	});

	it('keeps the escrow link visible while contract creation is still syncing', () => {
		const [thread] = resolveServiceQuoteThreads({
			requests: [createRequest()],
			proposals: [createProposal()],
			statuses: [
				createStatus('accepted', {
					escrowId: 'escrow-123',
					transactionHash: '0x' + 'a'.repeat(64)
				}),
				createStatus('contract_sync_pending', {
					id: 'syncing-event-id',
					created_at: 1_700_000_210,
					timestamp: 1_700_000_210,
					escrowId: 'escrow-123',
					transactionHash: '0x' + 'a'.repeat(64),
					message: 'Contract syncing'
				})
			],
			now: 1_700_000_250
		});

		expect(thread.latestProposal?.state).toBe('accepted');
		expect(thread.linkedEscrowId).toBe('escrow-123');
		expect(thread.latestProposal?.linkedEscrowId).toBe('escrow-123');
		expect(thread.latestProposal?.linkedTransactionHash).toBe('0x' + 'a'.repeat(64));
	});

	it('drops mismatched proposals and invalid status authors', () => {
		const request = createRequest();
		const proposal = {
			...createProposal(),
			content: {
				...createProposal().content,
				serviceAddress: `${serviceAddress}-mismatch`,
				serviceId: `${serviceAddress}-mismatch`
			}
		};
		const invalidStatus = {
			...createStatus('accepting'),
			pubkey: taskeePubkey,
			content: {
				...createStatus('accepting').content,
				actorPubkey: taskeePubkey
			}
		};

		expect(isProposalLinkedToRequest(request, proposal as never)).toBe(false);
		expect(
			isStatusLinkedToProposal(request, createProposal(), invalidStatus as never, 1_700_000_250)
		).toBe(false);

		const [thread] = resolveServiceQuoteThreads({
			requests: [request],
			proposals: [proposal as never, createProposal()],
			statuses: [invalidStatus as never],
			now: 1_700_000_250
		});

		expect(thread.proposals).toHaveLength(1);
		expect(thread.latestProposal?.state).toBe('pending');
	});

	it('marks proposals as expired when no terminal status exists after expiration', () => {
		const [thread] = resolveServiceQuoteThreads({
			requests: [createRequest()],
			proposals: [createProposal()],
			statuses: [],
			now: 1_700_259_301
		});

		expect(thread.latestProposal?.state).toBe('expired');
		expect(thread.latestProposal?.isExpired).toBe(true);
	});

	it('ignores accepted statuses that do not carry a valid acceptance snapshot', () => {
		const [thread] = resolveServiceQuoteThreads({
			requests: [createRequest()],
			proposals: [createProposal()],
			statuses: [
				createStatus('accepted', {
					escrowId: 'escrow-123',
					transactionHash: '0x' + 'a'.repeat(64),
					acceptanceSnapshot: undefined
				})
			],
			now: 1_700_000_250
		});

		expect(thread.latestProposal?.state).toBe('pending');
		expect(thread.linkedEscrowId).toBeUndefined();
	});

	it('resolves equivalent event sets deterministically regardless of arrival order', () => {
		const request = createRequest();
		const proposal = createProposal();
		const acceptingStatus = {
			...createStatus('accepting', {
				timestamp: 1_700_000_190
			}),
			created_at: 1_700_000_190
		};
		const acceptedStatus = {
			...createStatus('accepted', {
				timestamp: 1_700_000_195,
				escrowId: 'escrow-123',
				transactionHash: '0x' + 'b'.repeat(64),
				acceptanceSnapshot: createAcceptanceSnapshot({
					conversionSnapshotId: 'snapshot-deterministic'
				})
			}),
			created_at: 1_700_000_195
		};

		const [ordered] = resolveServiceQuoteThreads({
			requests: [request],
			proposals: [proposal],
			statuses: [acceptingStatus, acceptedStatus],
			now: 1_700_000_250
		});
		const [reversed] = resolveServiceQuoteThreads({
			requests: [request],
			proposals: [proposal],
			statuses: [acceptedStatus, acceptingStatus],
			now: 1_700_000_250
		});

		expect(ordered.latestProposal?.state).toBe('accepted');
		expect(reversed.latestProposal?.state).toBe('accepted');
		expect(reversed.latestProposal?.winningStatus?.id).toBe(
			ordered.latestProposal?.winningStatus?.id
		);
		expect(reversed.linkedEscrowId).toBe('escrow-123');
	});

	it('ignores invalid transition sequences and honors pre-expiry actions even if relay propagation lands later', () => {
		const request = createRequest();
		const proposal = createProposal();
		const invalidAccepted = createStatus('accepted', {
			timestamp: 1_700_000_195,
			acceptanceSnapshot: undefined
		});
		const lateButValidDecline = {
			...createStatus('declined', {
				timestamp: proposal.content.expirationTimestamp - 1
			}),
			created_at: proposal.content.expirationTimestamp + 30
		};

		const [thread] = resolveServiceQuoteThreads({
			requests: [request],
			proposals: [proposal],
			statuses: [invalidAccepted as never, lateButValidDecline as never],
			now: proposal.content.expirationTimestamp + 60
		});

		expect(thread.latestProposal?.state).toBe('declined');
		expect(thread.latestProposal?.winningStatus?.id).toBe(lateButValidDecline.id);
		expect(thread.latestProposal?.linkedEscrowId).toBeUndefined();
	});

	it('downgrades accepted proposals to accept_unknown when later ambiguity references the same escrow lineage', () => {
		const request = createRequest();
		const proposal = createProposal();
		const acceptedStatus = {
			...createStatus('accepted', {
				timestamp: 1_700_000_190,
				escrowId: 'escrow-123',
				transactionHash: '0x' + 'd'.repeat(64),
				acceptanceSnapshot: createAcceptanceSnapshot({
					conversionSnapshotId: 'snapshot-downgrade'
				})
			}),
			id: 'accepted-terminal-event-id',
			created_at: 1_700_000_190
		};
		const lateUnknownStatus = {
			...createStatus('accept_unknown', {
				timestamp: 1_700_000_195,
				reasonCode: 'reconciliation_deferred',
				transactionHash: '0x' + 'd'.repeat(64)
			}),
			id: 'unknown-terminal-event-id',
			created_at: 1_700_000_195
		};

		const [thread] = resolveServiceQuoteThreads({
			requests: [request],
			proposals: [proposal],
			statuses: [acceptedStatus as never, lateUnknownStatus as never],
			now: 1_700_000_250
		});

		expect(thread.latestProposal?.state).toBe('accept_unknown');
		expect(thread.latestProposal?.winningStatus).toBeUndefined();
		expect(thread.linkedEscrowId).toBe('escrow-123');
		expect(thread.latestProposal?.linkedEscrowId).toBe('escrow-123');
	});

	it('ignores unrelated late ambiguity after accepted when the lineage does not match', () => {
		const request = createRequest();
		const proposal = createProposal();
		const acceptedStatus = {
			...createStatus('accepted', {
				timestamp: 1_700_000_190,
				escrowId: 'escrow-123',
				transactionHash: '0x' + 'e'.repeat(64),
				acceptanceSnapshot: createAcceptanceSnapshot({
					conversionSnapshotId: 'snapshot-stable'
				})
			}),
			id: 'accepted-stable-event-id',
			created_at: 1_700_000_190
		};
		const unrelatedUnknownStatus = {
			...createStatus('accept_unknown', {
				timestamp: 1_700_000_195,
				reasonCode: 'reconciliation_deferred',
				transactionHash: '0x' + 'f'.repeat(64)
			}),
			id: 'unknown-unrelated-event-id',
			created_at: 1_700_000_195
		};

		const [thread] = resolveServiceQuoteThreads({
			requests: [request],
			proposals: [proposal],
			statuses: [acceptedStatus as never, unrelatedUnknownStatus as never],
			now: 1_700_000_250
		});

		expect(thread.latestProposal?.state).toBe('accepted');
		expect(thread.latestProposal?.winningStatus?.id).toBe('accepted-stable-event-id');
		expect(thread.linkedEscrowId).toBe('escrow-123');
	});

	it('upgrades accept_unknown threads to accepted when a later verified escrow status arrives', () => {
		const request = createRequest();
		const proposal = createProposal();
		const unknownStatus = {
			...createStatus('accept_unknown', {
				timestamp: 1_700_000_180,
				reasonCode: 'reconciliation_deferred',
				transactionHash: '0x' + '1'.repeat(64)
			}),
			created_at: 1_700_000_180
		};
		const acceptedStatus = {
			...createStatus('accepted', {
				timestamp: 1_700_000_190,
				escrowId: 'escrow-recovered',
				transactionHash: '0x' + '1'.repeat(64),
				acceptanceSnapshot: createAcceptanceSnapshot({
					conversionSnapshotId: 'snapshot-recovered'
				})
			}),
			created_at: 1_700_000_190
		};

		const [thread] = resolveServiceQuoteThreads({
			requests: [request],
			proposals: [proposal],
			statuses: [unknownStatus as never, acceptedStatus as never],
			now: 1_700_000_250
		});

		expect(thread.latestProposal?.state).toBe('accepted');
		expect(thread.latestProposal?.winningStatus?.id).toBe(acceptedStatus.id);
		expect(thread.linkedEscrowId).toBe('escrow-recovered');
		expect(thread.latestProposal?.linkedTransactionHash).toBe('0x' + '1'.repeat(64));
	});

	it('treats requests without proposals and non-terminal proposal states as delete blockers', () => {
		expect(
			isDeleteBlockingTimelineEntry({
				proposals: [],
				resolvedStatus: 'pending'
			})
		).toBe(true);
		expect(
			isDeleteBlockingTimelineEntry({
				proposals: [createProposal()],
				resolvedStatus: 'accept_failed'
			})
		).toBe(true);
		expect(
			isDeleteBlockingTimelineEntry({
				proposals: [createProposal()],
				resolvedStatus: 'accepted'
			})
		).toBe(false);
	});

	it('summarizes delete guard counts for timeline and thread collections', () => {
		const acceptedThread = resolveServiceQuoteThreads({
			requests: [createRequest()],
			proposals: [createProposal()],
			statuses: [createStatus('accepted', { escrowId: 'escrow-123' })],
			now: 1_700_000_250
		})[0];

		expect(
			summarizeDeleteGuardForTimelines([
				{
					proposals: [],
					resolvedStatus: 'pending'
				},
				{
					proposals: [createProposal()],
					resolvedStatus: 'expired'
				}
			])
		).toEqual({
			hasBlockingThreads: true,
			blockingThreadCount: 1,
			totalThreadCount: 2,
			activeContractCount: 0
		});

		expect(summarizeDeleteGuardForThreads([acceptedThread], 0)).toEqual({
			hasBlockingThreads: false,
			blockingThreadCount: 0,
			totalThreadCount: 1,
			activeContractCount: 0
		});
	});
});
