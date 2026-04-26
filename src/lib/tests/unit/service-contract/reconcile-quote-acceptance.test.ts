import { describe, expect, it, vi } from 'vitest';
import type { ContractWithEvents } from '$lib/types/contract';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { reconcileQuoteAcceptanceTimeline } from '$lib/utils/service-contract/reconcile-quote-acceptance';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const serviceAddress = '30402:' + 'a'.repeat(64) + ':service-1234';
const taskerPubkey = 'b'.repeat(64);
const providerPubkey = 'a'.repeat(64);

function createTimeline(): ServiceQuoteTimelineEntry {
	return {
		request: {
			id: 'request-event-id',
			kind: 6420,
			pubkey: taskerPubkey,
			created_at: 1_700_000_000,
			tags: [],
			content: {
				type: 'service-quote-request',
				quoteRequestId: 'qr_12345678',
				serviceId: serviceAddress,
				serviceAddress,
				pricingType: ServicePricingTypeEnum.TIERED,
				inquiry: {
					title: 'Need a logo refresh',
					description: 'Please redesign our logo.'
				},
				timestamp: 1_700_000_000,
				version: 'v1'
			},
			sig: 'sig'
		},
		proposals: [
			{
				id: 'proposal-event-id',
				kind: 6421,
				pubkey: providerPubkey,
				created_at: 1_700_000_100,
				tags: [],
				content: {
					type: 'service-proposal',
					proposalId: 'pr_12345678',
					quoteRequestId: 'qr_12345678',
					serviceId: serviceAddress,
					serviceAddress,
					paymentType: 'FIXED',
					amountUsdt: '140.00',
					description: 'Three concepts and revisions',
					estimatedDuration: '3 days',
					estimatedStartTime: 1_700_010_000,
					estimatedEndTime: 1_700_269_200,
					expirationDays: 3,
					expirationHours: 0,
					expirationTimestamp: 1_700_269_200,
					freelancerRskAddress: '0x1234567890123456789012345678901234567890',
					freelancerFeeTier: 1,
					pricingSnapshot: {
						serviceVersionRef: 'service-event-id'
					},
					timestamp: 1_700_000_100,
					version: 'v1'
				},
				sig: 'sig'
			}
		],
		statusEventsByProposalId: {
			pr_12345678: [
				{
					id: 'accept-unknown-event-id',
					kind: 6422,
					pubkey: taskerPubkey,
					created_at: 1_700_000_200,
					tags: [],
					content: {
						type: 'service-proposal-status',
						proposalId: 'pr_12345678',
						quoteRequestId: 'qr_12345678',
						serviceId: serviceAddress,
						serviceAddress,
						status: 'accept_unknown',
						actorPubkey: taskerPubkey,
						reasonCode: 'pending_timeout',
						transactionHash: '0x' + 'c'.repeat(64),
						timestamp: 1_700_000_200,
						version: 'v1'
					},
					sig: 'sig'
				}
			]
		},
		latestProposal: {
			id: 'proposal-event-id',
			kind: 6421,
			pubkey: providerPubkey,
			created_at: 1_700_000_100,
			tags: [],
			content: {
				type: 'service-proposal',
				proposalId: 'pr_12345678',
				quoteRequestId: 'qr_12345678',
				serviceId: serviceAddress,
				serviceAddress,
				paymentType: 'FIXED',
				amountUsdt: '140.00',
				description: 'Three concepts and revisions',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_010_000,
				estimatedEndTime: 1_700_269_200,
				expirationDays: 3,
				expirationHours: 0,
				expirationTimestamp: 1_700_269_200,
				freelancerRskAddress: '0x1234567890123456789012345678901234567890',
				freelancerFeeTier: 1,
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id'
				},
				timestamp: 1_700_000_100,
				version: 'v1'
			},
			sig: 'sig'
		},
		resolvedStatus: 'accept_unknown',
		resolvedTerminalEvent: {
			id: 'accept-unknown-event-id',
			kind: 6422,
			pubkey: taskerPubkey,
			created_at: 1_700_000_200,
			tags: [],
			content: {
				type: 'service-proposal-status',
				proposalId: 'pr_12345678',
				quoteRequestId: 'qr_12345678',
				serviceId: serviceAddress,
				serviceAddress,
				status: 'accept_unknown',
				actorPubkey: taskerPubkey,
				reasonCode: 'pending_timeout',
				transactionHash: '0x' + 'c'.repeat(64),
				timestamp: 1_700_000_200,
				version: 'v1'
			},
			sig: 'sig'
		},
		expirationTimestamp: 1_700_269_200,
		isExpired: false
	};
}

function createBareAcceptingTimeline(): ServiceQuoteTimelineEntry {
	const timeline = createTimeline();

	return {
		...timeline,
		statusEventsByProposalId: {
			pr_12345678: [
				{
					id: 'accepting-event-id',
					kind: 6422,
					pubkey: taskerPubkey,
					created_at: 1_700_000_200,
					tags: [],
					content: {
						type: 'service-proposal-status',
						proposalId: 'pr_12345678',
						quoteRequestId: 'qr_12345678',
						serviceId: serviceAddress,
						serviceAddress,
						status: 'accepting',
						actorPubkey: taskerPubkey,
						timestamp: 1_700_000_200,
						version: 'v1'
					},
					sig: 'sig'
				}
			]
		},
		resolvedStatus: 'accepting',
		resolvedTerminalEvent: {
			id: 'accepting-event-id',
			kind: 6422,
			pubkey: taskerPubkey,
			created_at: 1_700_000_200,
			tags: [],
			content: {
				type: 'service-proposal-status',
				proposalId: 'pr_12345678',
				quoteRequestId: 'qr_12345678',
				serviceId: serviceAddress,
				serviceAddress,
				status: 'accepting',
				actorPubkey: taskerPubkey,
				timestamp: 1_700_000_200,
				version: 'v1'
			},
			sig: 'sig'
		}
	};
}

function createContract(
	overrides: Partial<ContractWithEvents['contractEvent']['content']> = {},
	options: { eventId?: string } = {}
): ContractWithEvents {
	const escrowId = overrides.escrowId ?? 'escrow-123';

	return {
		contractEvent: {
			id: options.eventId ?? 'contract-event-id',
			kind: 30000,
			pubkey: taskerPubkey,
			created_at: 1_700_000_300,
			tags: [],
			content: {
				escrowId,
				taskId: serviceAddress,
				taskTitle: 'Need a logo refresh',
				taskDescription: 'Please redesign our logo.',
				freelancerPubkey: providerPubkey,
				clientPubkey: taskerPubkey,
				clientRskAddress: '0x3333333333333333333333333333333333333333',
				amount: '0.0014',
				currency: 'RBTC',
				status: 'Created' as never,
				estimatedStartTime: 1_700_010_000,
				estimatedCompletionTime: 1_700_269_200,
				type: 'contract',
				contextType: 'service',
				contextId: serviceAddress,
				contextTitle: 'Need a logo refresh',
				contextDescription: 'Please redesign our logo.',
				contextVersionRef: 'service-event-id',
				serviceId: serviceAddress,
				serviceAddress,
				serviceTitle: 'Need a logo refresh',
				quoteRequestId: 'qr_12345678',
				proposalId: 'pr_12345678',
				proposalEventId: 'proposal-event-id',
				purchaseMode: 'quote',
				transactionHash: '0x' + 'c'.repeat(64),
				contractAddress: '0x2222222222222222222222222222222222222222',
				...overrides
			},
			sig: 'sig'
		},
		statusEvents: [],
		isClient: true,
		blockchainStatus: 'Created' as never,
		escrowData: {
			id: escrowId,
			client: '0x3333333333333333333333333333333333333333',
			freelancer: '0x1234567890123456789012345678901234567890'
		} as never,
		status: 'Created' as never,
		isPending: false,
		permissions: {} as never,
		disputeProposal: null,
		completionAttachments: null
	};
}

describe('reconcileQuoteAcceptanceTimeline', () => {
	it('heals a legacy bare accepting timeline from a uniquely matching queried quote contract', async () => {
		const queryContracts = vi.fn().mockResolvedValue([createContract()]);

		const result = await reconcileQuoteAcceptanceTimeline({
			timeline: createBareAcceptingTimeline(),
			loadedContracts: [],
			queryContracts
		});

		expect(queryContracts).toHaveBeenCalledTimes(1);
		expect(result.status).toBe('accepted');
	});

	it('recovers accepted status from a matching loaded quote contract', async () => {
		const result = await reconcileQuoteAcceptanceTimeline({
			timeline: createTimeline(),
			loadedContracts: [createContract()]
		});

		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') {
			throw new Error('Expected accepted reconciliation result.');
		}
		expect(result.escrowId).toBe('escrow-123');
		expect(result.transactionHash).toBe('0x' + 'c'.repeat(64));
		expect(result.acceptanceSnapshot.clientRskAddress).toBe(
			'0x3333333333333333333333333333333333333333'
		);
	});

	it('queries contracts for reverse quote lookup when no loaded contract matches yet', async () => {
		const queryContracts = vi.fn().mockResolvedValue([createContract()]);

		const result = await reconcileQuoteAcceptanceTimeline({
			timeline: createTimeline(),
			loadedContracts: [],
			queryContracts
		});

		expect(queryContracts).toHaveBeenCalledTimes(1);
		expect(result.status).toBe('accepted');
	});

	it('heals legacy bare accepting timelines from a unique exact contract match without tx metadata', async () => {
		const recoverContract = vi.fn();

		const result = await reconcileQuoteAcceptanceTimeline({
			timeline: createBareAcceptingTimeline(),
			loadedContracts: [createContract()],
			recoverContract
		});

		expect(recoverContract).not.toHaveBeenCalled();
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') {
			throw new Error('Expected accepted reconciliation result.');
		}
		expect(result.escrowId).toBe('escrow-123');
		expect(result.transactionHash).toBe('0x' + 'c'.repeat(64));
	});

	it('does not heal legacy bare accepting timelines when multiple exact contracts match', async () => {
		const recoverContract = vi.fn();
		const firstContract = createContract(
			{
				proposalId: undefined,
				transactionHash: '0x' + 'c'.repeat(64)
			},
			{ eventId: 'contract-event-id-1' }
		);
		const secondContract = createContract(
			{
				escrowId: 'escrow-456',
				proposalId: undefined,
				transactionHash: '0x' + 'd'.repeat(64),
				contractAddress: '0x4444444444444444444444444444444444444444'
			},
			{ eventId: 'contract-event-id-2' }
		);

		const result = await reconcileQuoteAcceptanceTimeline({
			timeline: createBareAcceptingTimeline(),
			loadedContracts: [firstContract, secondContract],
			recoverContract
		});

		expect(recoverContract).not.toHaveBeenCalled();
		expect(result).toEqual({ status: 'no_change' });
	});

	it('returns contract_sync_pending when chain recovery identifies the escrow before hydration catches up', async () => {
		const recoverContract = vi.fn().mockResolvedValue({
			status: 'contract_sync_pending',
			transactionHash: '0x' + 'c'.repeat(64),
			escrowId: 'escrow-123'
		});

		const result = await reconcileQuoteAcceptanceTimeline({
			timeline: createTimeline(),
			loadedContracts: [],
			queryContracts: vi.fn().mockResolvedValue([]),
			recoverContract
		});

		expect(recoverContract).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			status: 'contract_sync_pending',
			escrowId: 'escrow-123',
			transactionHash: '0x' + 'c'.repeat(64)
		});
	});

	it('promotes contract_ready recovery to accepted once the contract becomes queryable', async () => {
		const queryContracts = vi
			.fn()
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([createContract()]);
		const recoverContract = vi.fn().mockResolvedValue({
			status: 'contract_ready',
			transactionHash: '0x' + 'c'.repeat(64),
			escrowId: 'escrow-123'
		});

		const result = await reconcileQuoteAcceptanceTimeline({
			timeline: createTimeline(),
			loadedContracts: [],
			queryContracts,
			recoverContract
		});

		expect(recoverContract).toHaveBeenCalledTimes(1);
		expect(queryContracts).toHaveBeenCalledTimes(2);
		expect(result.status).toBe('accepted');
	});

	it('recovers when resolvedTerminalEvent has transactionHash but statusEvent escrowId is missing', async () => {
		const txHash = '0x' + 'c'.repeat(64);
		const timelineWithTxHashOnly: ServiceQuoteTimelineEntry = {
			...createBareAcceptingTimeline(),
			statusEventsByProposalId: {
				pr_12345678: [
					{
						id: 'accepting-event-id',
						kind: 6422,
						pubkey: taskerPubkey,
						created_at: 1_700_000_200,
						tags: [],
						content: {
							type: 'service-proposal-status',
							proposalId: 'pr_12345678',
							quoteRequestId: 'qr_12345678',
							serviceId: serviceAddress,
							serviceAddress,
							status: 'accepting',
							actorPubkey: taskerPubkey,
							timestamp: 1_700_000_200,
							version: 'v1'
							// No transactionHash, no escrowId
						},
						sig: 'sig'
					}
				]
			},
			resolvedStatus: 'accepting',
			resolvedTerminalEvent: {
				id: 'accepting-event-id',
				kind: 6422,
				pubkey: taskerPubkey,
				created_at: 1_700_000_200,
				tags: [],
				content: {
					type: 'service-proposal-status',
					proposalId: 'pr_12345678',
					quoteRequestId: 'qr_12345678',
					serviceId: serviceAddress,
					serviceAddress,
					status: 'accepting',
					actorPubkey: taskerPubkey,
					transactionHash: txHash,
					// escrowId is missing - this is the edge case
					timestamp: 1_700_000_200,
					version: 'v1'
				},
				sig: 'sig'
			}
		};

		const recoverContract = vi.fn().mockResolvedValue({
			status: 'contract_ready',
			transactionHash: txHash,
			escrowId: 'escrow-123'
		});

		const result = await reconcileQuoteAcceptanceTimeline({
			timeline: timelineWithTxHashOnly,
			loadedContracts: [],
			queryContracts: vi.fn().mockResolvedValue([]),
			recoverContract
		});

		// Should proceed with recovery using transactionHash from resolvedTerminalEvent
		// Since no contract is found after recovery, it returns contract_sync_pending
		expect(recoverContract).toHaveBeenCalledTimes(1);
		expect(recoverContract).toHaveBeenCalledWith(
			expect.objectContaining({
				transactionHash: txHash
			})
		);
		expect(result.status).toBe('contract_sync_pending');
	});
});
