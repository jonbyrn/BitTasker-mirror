import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';
import type { NostrContract, ContractStatusEvent } from '$lib/types/contract';
import { determineContractState } from '$lib/utils/helpers/contractPermissions';

describe('contractPermissions', () => {
	const now = Math.floor(Date.now() / 1000);
	const oneHour = 3600;
	const oneDay = 86400;

	const mockEscrowData: EscrowData = {
		id: '123',
		client: '0x1111111111111111111111111111111111111111',
		freelancer: '0x2222222222222222222222222222222222222222',
		baseAmount: '1.0',
		clientFee: '0.02',
		freelancerFee: '0.02',
		totalAmount: '1.02',
		status: EscrowStatus.Funded,
		estimatedStartTime: now + oneHour,
		estimatedCompletionTime: now + oneDay,
		completionTime: 0,
		timelockExpiry: now + oneDay + 7 * oneDay, // 7 days after completion
		clientFeeTier: 1,
		freelancerFeeTier: 1,
		createdAt: now * 1000,
		lastUpdated: now * 1000
	};

	const mockContract: NostrContract = {
		id: 'contract-123',
		escrowId: '123',
		taskId: 'task-123',
		taskTitle: 'Test Task',
		taskDescription: 'Test Description',
		clientPubkey: 'npub1client',
		freelancerPubkey: 'npub1freelancer',
		amount: '1.0',
		estimatedStartTime: now + oneHour,
		estimatedCompletionTime: now + oneDay,
		transactionHash: '0x123',
		createdAt: now * 1000,
		updatedAt: now * 1000
	};

	beforeEach(() => {
		// Reset Date.now mock if needed
		vi.useFakeTimers();
		vi.setSystemTime(now * 1000);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('determineContractState', () => {
		describe('Pending Funding State', () => {
			it('should return PendingFunding when isPending and transactionHash exists', () => {
				const result = determineContractState(
					null,
					[],
					{ ...mockContract, transactionHash: '0x123' },
					null,
					null,
					true,
					true,
					false
				);

				expect(result.status).toBe(EscrowStatus.PendingFunding);
				expect(result.permissions.canDelete).toBe(false);
				expect(result.permissions.canCancel).toBe(false);
				expect(result.permissions.canRefund).toBe(false);
			});
		});

		describe('Never Funded State', () => {
			it('should allow deletion for never-funded contracts', () => {
				const result = determineContractState(
					null,
					[],
					{ ...mockContract, transactionHash: undefined },
					null,
					null,
					false,
					true,
					false
				);

				expect(result.status).toBe(EscrowStatus.Funded);
				expect(result.permissions.canDelete).toBe(true);
				expect(result.permissions.canRefund).toBe(false);
			});

			it('should handle pending states for never-funded contracts', () => {
				const statusEvents: ContractStatusEvent[] = [
					{
						id: 'event-1',
						pubkey: 'npub1client',
						created_at: now,
						kind: 1,
						sig: 'sig',
						tags: [],
						content: {
							action: EscrowStatus.PendingCompletion,
							transactionHash: '0x456',
							message: 'Pending completion'
						}
					}
				];

				const result = determineContractState(
					null,
					statusEvents,
					{ ...mockContract, transactionHash: undefined },
					null,
					null,
					false,
					true,
					false
				);

				expect(result.status).toBe(EscrowStatus.PendingCompletion);
				expect(result.permissions.canDelete).toBe(false);
			});
		});

		describe('Funded State', () => {
			it('should allow freelancer to complete after start time', () => {
				const escrowData = {
					...mockEscrowData,
					estimatedStartTime: now - oneHour // Started 1 hour ago
				};

				const result = determineContractState(
					EscrowStatus.Funded,
					[],
					mockContract,
					escrowData,
					null,
					false,
					false,
					true // isFreelancer
				);

				expect(result.status).toBe(EscrowStatus.InProgress);
				expect(result.permissions.canComplete).toBe(true);
			});

			it('should not allow completion before start time', () => {
				const escrowData = {
					...mockEscrowData,
					estimatedStartTime: now + oneHour // Starts in 1 hour
				};

				const result = determineContractState(
					EscrowStatus.Funded,
					[],
					mockContract,
					escrowData,
					null,
					false,
					false,
					true
				);

				expect(result.status).toBe(EscrowStatus.Funded);
				expect(result.permissions.canComplete).toBe(false);
			});

			it('should allow client cancellation within 1-hour grace period', () => {
				const escrowData = {
					...mockEscrowData,
					createdAt: (now - 1800) * 1000, // Created 30 minutes ago
					estimatedStartTime: now + oneDay
				};

				const result = determineContractState(
					EscrowStatus.Funded,
					[],
					mockContract,
					escrowData,
					null,
					false,
					true, // isClient
					false
				);

				expect(result.permissions.canCancel).toBe(true);
			});

			it('should allow client cancellation more than 24h before start', () => {
				const escrowData = {
					...mockEscrowData,
					createdAt: (now - 2 * oneDay) * 1000, // Created 2 days ago
					estimatedStartTime: now + 2 * oneDay // Starts in 2 days
				};

				const result = determineContractState(
					EscrowStatus.Funded,
					[],
					mockContract,
					escrowData,
					null,
					false,
					true,
					false
				);

				expect(result.permissions.canCancel).toBe(true);
			});

			it('should prevent client cancellation outside grace period and within 24h', () => {
				const escrowData = {
					...mockEscrowData,
					createdAt: (now - 2 * oneHour) * 1000, // Created 2 hours ago
					estimatedStartTime: now + 12 * oneHour // Starts in 12 hours
				};

				const result = determineContractState(
					EscrowStatus.Funded,
					[],
					mockContract,
					escrowData,
					null,
					false,
					true,
					false
				);

				expect(result.permissions.canCancel).toBe(false);
			});

			it('should always allow freelancer to refund', () => {
				const escrowData = {
					...mockEscrowData,
					createdAt: (now - 2 * oneDay) * 1000,
					estimatedStartTime: now + 12 * oneHour
				};

				const result = determineContractState(
					EscrowStatus.Funded,
					[],
					mockContract,
					escrowData,
					null,
					false,
					false,
					true
				);

				expect(result.permissions.canCancel).toBe(false);
				expect(result.permissions.canRefund).toBe(true);
			});

			it('should show PendingCancellation when cancellation is in progress', () => {
				const statusEvents: ContractStatusEvent[] = [
					{
						id: 'event-1',
						pubkey: 'npub1client',
						created_at: now,
						kind: 1,
						sig: 'sig',
						tags: [],
						content: {
							action: EscrowStatus.PendingCancellation,
							transactionHash: '0x789',
							message: 'Cancelling...'
						}
					}
				];

				const result = determineContractState(
					EscrowStatus.Funded,
					statusEvents,
					mockContract,
					mockEscrowData,
					null,
					false,
					true,
					false
				);

				expect(result.status).toBe(EscrowStatus.PendingCancellation);
				expect(result.permissions.canCancel).toBe(false);
				expect(result.permissions.canRefund).toBe(false);
			});

			it('should show PendingCompletion when completion is in progress', () => {
				const statusEvents: ContractStatusEvent[] = [
					{
						id: 'event-1',
						pubkey: 'npub1freelancer',
						created_at: now,
						kind: 1,
						sig: 'sig',
						tags: [],
						content: {
							action: EscrowStatus.PendingCompletion,
							transactionHash: '0xabc',
							message: 'Completing...'
						}
					}
				];

				const result = determineContractState(
					EscrowStatus.Funded,
					statusEvents,
					mockContract,
					mockEscrowData,
					null,
					false,
					false,
					true
				);

				expect(result.status).toBe(EscrowStatus.PendingCompletion);
				expect(result.permissions.canComplete).toBe(false);
				expect(result.permissions.canRefund).toBe(false);
			});
		});

		describe('Completed State', () => {
			it('should allow client to accept before timelock expires', () => {
				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.Completed,
					timelockExpiry: now + oneDay // Timelock expires in 1 day
				};

				const result = determineContractState(
					EscrowStatus.Completed,
					[],
					mockContract,
					escrowData,
					null,
					false,
					true,
					false
				);

				expect(result.status).toBe(EscrowStatus.Completed);
				expect(result.permissions.canAccept).toBe(true);
				expect(result.permissions.canDispute).toBe(true);
			});

			it('should allow freelancer to refund after completion', () => {
				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.Completed,
					estimatedStartTime: now - oneHour,
					timelockExpiry: now + oneDay
				};

				const result = determineContractState(
					EscrowStatus.Completed,
					[],
					mockContract,
					escrowData,
					null,
					false,
					false,
					true
				);

				expect(result.status).toBe(EscrowStatus.Completed);
				expect(result.permissions.canCancel).toBe(false);
				expect(result.permissions.canRefund).toBe(true);
				expect(result.permissions.canAccept).toBe(false);
			});

			it('should allow timelock resolution after expiry', () => {
				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.Completed,
					timelockExpiry: now - oneHour // Timelock expired 1 hour ago
				};

				const result = determineContractState(
					EscrowStatus.Completed,
					[],
					mockContract,
					escrowData,
					null,
					false,
					false,
					true
				);

				expect(result.permissions.canResolveTimelock).toBe(true);
			});

			it('should show FundsReleased when funds are released', () => {
				const statusEvents: ContractStatusEvent[] = [
					{
						id: 'event-1',
						pubkey: 'npub1client',
						created_at: now,
						kind: 1,
						sig: 'sig',
						tags: [],
						content: {
							action: EscrowStatus.FundsReleased,
							message: 'Funds released'
						}
					}
				];

				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.Completed
				};

				const result = determineContractState(
					EscrowStatus.Completed,
					statusEvents,
					mockContract,
					escrowData,
					null,
					false,
					true,
					false
				);

				expect(result.status).toBe(EscrowStatus.FundsReleased);
				expect(result.permissions.canAccept).toBe(false);
				expect(result.permissions.canDelete).toBe(false);
			});

			it('should show PendingAcceptance when acceptance is in progress', () => {
				const statusEvents: ContractStatusEvent[] = [
					{
						id: 'event-1',
						pubkey: 'npub1client',
						created_at: now,
						kind: 1,
						sig: 'sig',
						tags: [],
						content: {
							action: EscrowStatus.PendingAcceptance,
							transactionHash: '0xdef',
							message: 'Accepting...'
						}
					}
				];

				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.Completed
				};

				const result = determineContractState(
					EscrowStatus.Completed,
					statusEvents,
					mockContract,
					escrowData,
					null,
					false,
					true,
					false
				);

				expect(result.status).toBe(EscrowStatus.PendingAcceptance);
				expect(result.permissions.canAccept).toBe(false);
				expect(result.permissions.canRefund).toBe(false);
			});

			it('should allow client to dispute within 24h of start or after grace period', () => {
				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.Completed,
					estimatedStartTime: now - 12 * oneHour, // Started 12 hours ago
					createdAt: (now - 2 * oneHour) * 1000 // Created 2 hours ago
				};

				const result = determineContractState(
					EscrowStatus.Completed,
					[],
					mockContract,
					escrowData,
					null,
					false,
					true,
					false
				);

				expect(result.permissions.canDispute).toBe(true);
			});
		});

		describe('In Dispute State', () => {
			it('should allow freelancer to refund while disputed', () => {
				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.InDispute,
					estimatedStartTime: now - oneHour,
					timelockExpiry: now + oneDay
				};

				const result = determineContractState(
					EscrowStatus.InDispute,
					[],
					mockContract,
					escrowData,
					null,
					false,
					false,
					true
				);

				expect(result.status).toBe(EscrowStatus.InDispute);
				expect(result.permissions.canCancel).toBe(false);
				expect(result.permissions.canRefund).toBe(true);
				expect(result.permissions.canPropose).toBe(true);
			});
		});

		describe('InDispute State', () => {
			it('should show DisputeResolutionProposed when proposal exists', () => {
				const disputeProposal: DisputeProposal = {
					escrowId: '123',
					proposer: '0x1111111111111111111111111111111111111111',
					freelancerAmount: '0.5',
					timestamp: now,
					accepted: false
				};

				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.InDispute
				};

				const result = determineContractState(
					EscrowStatus.InDispute,
					[],
					mockContract,
					escrowData,
					disputeProposal,
					false,
					false,
					true
				);

				expect(result.status).toBe(EscrowStatus.DisputeResolutionProposed);
				expect(result.permissions.canAcceptProposal).toBe(true);
			});

			it('should allow non-proposer to accept proposal', () => {
				const disputeProposal: DisputeProposal = {
					escrowId: '123',
					proposer: '0x1111111111111111111111111111111111111111', // Client proposed
					freelancerAmount: '0.5',
					timestamp: now,
					accepted: false
				};

				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.InDispute
				};

				const result = determineContractState(
					EscrowStatus.InDispute,
					[],
					mockContract,
					escrowData,
					disputeProposal,
					false,
					false,
					true // Freelancer can accept client's proposal
				);

				expect(result.permissions.canAcceptProposal).toBe(true);
			});

			it('should prevent proposer from accepting own proposal', () => {
				const disputeProposal: DisputeProposal = {
					escrowId: '123',
					proposer: '0x1111111111111111111111111111111111111111', // Client proposed
					freelancerAmount: '0.5',
					timestamp: now,
					accepted: false
				};

				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.InDispute
				};

				const result = determineContractState(
					EscrowStatus.InDispute,
					[],
					mockContract,
					escrowData,
					disputeProposal,
					false,
					true, // Client cannot accept own proposal
					false
				);

				expect(result.permissions.canAcceptProposal).toBe(false);
			});

			it('should limit proposals to 2 per party', () => {
				const statusEvents: ContractStatusEvent[] = [
					{
						id: 'event-1',
						pubkey: mockContract.clientPubkey,
						created_at: now,
						kind: 1,
						sig: 'sig',
						tags: [],
						content: {
							action: EscrowStatus.DisputeResolutionProposed,
							message: 'Proposal 1'
						}
					},
					{
						id: 'event-2',
						pubkey: mockContract.clientPubkey,
						created_at: now + 100,
						kind: 1,
						sig: 'sig',
						tags: [],
						content: {
							action: EscrowStatus.DisputeResolutionProposed,
							message: 'Proposal 2'
						}
					}
				];

				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.InDispute
				};

				const result = determineContractState(
					EscrowStatus.InDispute,
					statusEvents,
					mockContract,
					escrowData,
					null,
					false,
					true, // Client has made 2 proposals
					false
				);

				expect(result.permissions.canPropose).toBe(false);
			});

			it('should allow client to resolve timelock after expiry', () => {
				const escrowData = {
					...mockEscrowData,
					status: EscrowStatus.InDispute,
					timelockExpiry: now - oneHour // Timelock expired
				};

				const result = determineContractState(
					EscrowStatus.InDispute,
					[],
					mockContract,
					escrowData,
					null,
					false,
					true, // Only client can resolve
					false
				);

				expect(result.permissions.canResolveTimelock).toBe(true);
			});
		});

		describe('Final States', () => {
			it('should disable all actions for DisputeResolved', () => {
				const result = determineContractState(
					EscrowStatus.DisputeResolved,
					[],
					mockContract,
					mockEscrowData,
					null,
					false,
					true,
					false
				);

				expect(result.status).toBe(EscrowStatus.DisputeResolved);
				expect(result.permissions.canComplete).toBe(false);
				expect(result.permissions.canAccept).toBe(false);
				expect(result.permissions.canDispute).toBe(false);
				expect(result.permissions.canPropose).toBe(false);
				expect(result.permissions.canAcceptProposal).toBe(false);
				expect(result.permissions.canCancel).toBe(false);
				expect(result.permissions.canRefund).toBe(false);
				expect(result.permissions.canResolveTimelock).toBe(false);
				expect(result.permissions.canDelete).toBe(false);
			});

			it('should disable all actions for Cancelled', () => {
				const result = determineContractState(
					EscrowStatus.Cancelled,
					[],
					mockContract,
					mockEscrowData,
					null,
					false,
					true,
					false
				);

				expect(result.status).toBe(EscrowStatus.Cancelled);
				expect(result.permissions.canDelete).toBe(false);
				expect(result.permissions.canRefund).toBe(false);
			});
		});
	});
});
