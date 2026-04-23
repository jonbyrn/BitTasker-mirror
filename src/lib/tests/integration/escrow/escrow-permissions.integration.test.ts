import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
import { determineContractState } from '$lib/utils/helpers/contractPermissions';
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';
import type { NostrContract, ContractStatusEvent } from '$lib/types/contract';

// Mock dependencies
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr.toLowerCase())
}));

vi.mock('svelte-i18n', () => {
	const mockT = Object.assign(
		vi.fn((key: string) => key),
		{ subscribe: vi.fn() }
	);
	return { t: mockT };
});

vi.mock('svelte/store', () => {
	const translationFn = (key: string) => key;
	const mockGet = vi.fn((store: unknown) => {
		if (typeof store === 'function') {
			const fn = store as (() => unknown) & { subscribe?: unknown; toString?: () => string };
			if (fn.subscribe || fn.toString?.().includes('t')) {
				return translationFn;
			}
			try {
				return fn();
			} catch {
				return translationFn;
			}
		}
		return store;
	});
	return {
		get: mockGet,
		writable: vi.fn(() => ({
			set: vi.fn(),
			subscribe: vi.fn(),
			update: vi.fn()
		}))
	};
});

describe('Escrow Permissions Integration Tests', () => {
	const now = Math.floor(Date.now() / 1000);
	const clientPubkey = 'client-pubkey';
	const freelancerPubkey = 'freelancer-pubkey';

	const createMockEscrowData = (
		state: EscrowStatus,
		overrides: Partial<EscrowData> = {}
	): EscrowData => ({
		id: '123',
		client: '0x1111111111111111111111111111111111111111',
		freelancer: '0x2222222222222222222222222222222222222222',
		baseAmount: '1.0',
		clientFee: '0',
		freelancerFee: '0',
		totalAmount: '1.0',
		status: state,
		estimatedStartTime: now + 3600, // Numbers, not BigInt
		estimatedCompletionTime: now + 7200,
		completionTime: 0,
		timelockExpiry: now + 604800,
		clientFeeTier: 1,
		freelancerFeeTier: 1,
		createdAt: now * 1000, // Milliseconds
		lastUpdated: now * 1000,
		...overrides
	});

	const createMockContract = (status: EscrowStatus): NostrContract => ({
		escrowId: '123',
		taskId: 'task-123',
		taskTitle: 'Test Task',
		taskDescription: 'Test Description',
		freelancerPubkey,
		clientPubkey,
		amount: '1.0',
		currency: 'RBTC',
		status,
		estimatedStartTime: now + 3600,
		estimatedCompletionTime: now + 7200,
		transactionHash: '0x123',
		type: 'contract',
		contractAddress: '0xcontract'
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Client Permissions', () => {
		it('should allow client to cancel funded escrow within grace period', () => {
			// Created just now (within 1 hour grace period)
			const escrowData = createMockEscrowData(EscrowStatus.Funded, {
				createdAt: now * 1000 // Milliseconds, just created
			});
			const contract = createMockContract(EscrowStatus.Funded);

			const result = determineContractState(
				EscrowStatus.Funded,
				[],
				contract,
				escrowData,
				null,
				false,
				true, // isClient
				false
			);

			expect(result.permissions.canCancel).toBe(true);
		});

		it('should allow client to cancel funded escrow >24h before start', () => {
			const futureStartTime = now + 86400 + 3600; // >24 hours away
			const escrowData = createMockEscrowData(EscrowStatus.Funded, {
				estimatedStartTime: futureStartTime // Number, not BigInt
			});
			const contract = createMockContract(EscrowStatus.Funded);
			contract.estimatedStartTime = futureStartTime;

			const result = determineContractState(
				EscrowStatus.Funded,
				[],
				contract,
				escrowData,
				null,
				false,
				true,
				false
			);

			expect(result.permissions.canCancel).toBe(true);
		});

		it('should prevent client from canceling during work period', () => {
			const pastStartTime = now - 3600;
			const futureCompletionTime = now + 3600;
			const escrowData = createMockEscrowData(EscrowStatus.Funded, {
				estimatedStartTime: pastStartTime, // Number
				estimatedCompletionTime: futureCompletionTime,
				createdAt: (now - 7200) * 1000 // Created 2 hours ago (past grace period), in milliseconds
			});
			const contract = createMockContract(EscrowStatus.Funded);
			contract.estimatedStartTime = pastStartTime;
			contract.estimatedCompletionTime = futureCompletionTime;

			const result = determineContractState(
				EscrowStatus.Funded,
				[],
				contract,
				escrowData,
				null,
				false,
				true,
				false
			);

			expect(result.permissions.canCancel).toBe(false);
		});

		it('should allow client to accept completed task', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Completed);
			const contract = createMockContract(EscrowStatus.Completed);

			const result = determineContractState(
				EscrowStatus.Completed,
				[],
				contract,
				escrowData,
				null,
				false,
				true,
				false
			);

			expect(result.permissions.canAccept).toBe(true);
			expect(result.permissions.canDispute).toBe(true);
		});

		it('should allow client to dispute completed task', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Completed, {
				estimatedStartTime: now - 3600, // Within 24h window, Number
				timelockExpiry: now + 604800
			});
			const contract = createMockContract(EscrowStatus.Completed);

			const result = determineContractState(
				EscrowStatus.Completed,
				[],
				contract,
				escrowData,
				null,
				false,
				true,
				false
			);

			expect(result.permissions.canDispute).toBe(true);
		});

		it('should allow client to propose dispute resolution', () => {
			const escrowData = createMockEscrowData(EscrowStatus.InDispute);
			const contract = createMockContract(EscrowStatus.InDispute);

			const result = determineContractState(
				EscrowStatus.InDispute,
				[],
				contract,
				escrowData,
				null,
				false,
				true,
				false
			);

			expect(result.permissions.canPropose).toBe(true);
		});

		it('should prevent client from completing task', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Funded, {
				estimatedStartTime: now - 3600 // Past start time, Number
			});
			const contract = createMockContract(EscrowStatus.Funded);
			contract.estimatedStartTime = now - 3600;

			const result = determineContractState(
				EscrowStatus.Funded,
				[],
				contract,
				escrowData,
				null,
				false,
				true,
				false
			);

			expect(result.permissions.canComplete).toBe(false); // Client cannot complete
		});
	});

	describe('Freelancer Permissions', () => {
		it('should allow freelancer to complete task after start time', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Funded, {
				estimatedStartTime: now - 3600 // Past start time, Number
			});
			const contract = createMockContract(EscrowStatus.Funded);
			contract.estimatedStartTime = now - 3600;

			const result = determineContractState(
				EscrowStatus.Funded,
				[],
				contract,
				escrowData,
				null,
				false,
				false,
				true // isFreelancer
			);

			expect(result.permissions.canComplete).toBe(true);
		});

		it('should prevent freelancer from completing before start time', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Funded, {
				estimatedStartTime: now + 3600 // Future start time, Number
			});
			const contract = createMockContract(EscrowStatus.Funded);
			contract.estimatedStartTime = now + 3600;

			const result = determineContractState(
				EscrowStatus.Funded,
				[],
				contract,
				escrowData,
				null,
				false,
				false,
				true
			);

			expect(result.permissions.canComplete).toBe(false);
		});

		it('should prevent freelancer from accepting their own work', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Completed, {
				estimatedStartTime: now - 3600,
				timelockExpiry: now + 604800
			});
			const contract = createMockContract(EscrowStatus.Completed);

			const result = determineContractState(
				EscrowStatus.Completed,
				[],
				contract,
				escrowData,
				null,
				false,
				false,
				true
			);

			expect(result.permissions.canAccept).toBe(false);
		});

		it('should prevent freelancer from disputing', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Completed);
			const contract = createMockContract(EscrowStatus.Completed);

			const result = determineContractState(
				EscrowStatus.Completed,
				[],
				contract,
				escrowData,
				null,
				false,
				false,
				true
			);

			expect(result.permissions.canDispute).toBe(false);
		});

		it('should allow freelancer to refund after completion', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Completed, {
				estimatedStartTime: now - 3600,
				timelockExpiry: now + 604800
			});
			const contract = createMockContract(EscrowStatus.Completed);

			const result = determineContractState(
				EscrowStatus.Completed,
				[],
				contract,
				escrowData,
				null,
				false,
				false,
				true
			);

			expect(result.permissions.canRefund).toBe(true);
			expect(result.permissions.canAccept).toBe(false);
		});

		it('should allow freelancer to accept dispute proposal', () => {
			const escrowData = createMockEscrowData(EscrowStatus.InDispute);
			const contract = createMockContract(EscrowStatus.InDispute);
			const disputeProposal: DisputeProposal = {
				escrowId: '123',
				freelancerAmount: '0.5',
				proposer: '0x1111111111111111111111111111111111111111', // Client proposed
				timestamp: now,
				accepted: false
			};

			const result = determineContractState(
				EscrowStatus.InDispute,
				[],
				contract,
				escrowData,
				disputeProposal,
				false,
				false,
				true
			);

			expect(result.permissions.canAcceptProposal).toBe(true);
		});

		it('should prevent freelancer from accepting their own proposal', () => {
			const escrowData = createMockEscrowData(EscrowStatus.InDispute);
			const contract = createMockContract(EscrowStatus.InDispute);
			const disputeProposal: DisputeProposal = {
				escrowId: '123',
				freelancerAmount: '0.5',
				proposer: '0x2222222222222222222222222222222222222222', // Freelancer proposed
				timestamp: now,
				accepted: false
			};

			const result = determineContractState(
				EscrowStatus.InDispute,
				[],
				contract,
				escrowData,
				disputeProposal,
				false,
				false,
				true
			);

			expect(result.permissions.canAcceptProposal).toBe(false);
		});

		it('should allow freelancer to refund while disputed', () => {
			const escrowData = createMockEscrowData(EscrowStatus.InDispute, {
				estimatedStartTime: now - 3600,
				timelockExpiry: now + 604800
			});
			const contract = createMockContract(EscrowStatus.InDispute);

			const result = determineContractState(
				EscrowStatus.InDispute,
				[],
				contract,
				escrowData,
				null,
				false,
				false,
				true
			);

			expect(result.permissions.canRefund).toBe(true);
			expect(result.permissions.canPropose).toBe(true);
		});
	});

	describe('Pending State Permissions', () => {
		it('should disable all actions when transaction is pending', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Funded);
			const contract = createMockContract(EscrowStatus.Funded);

			const pendingEvent: ContractStatusEvent = {
				id: 'pending',
				pubkey: freelancerPubkey,
				created_at: now,
				kind: 4,
				sig: 'sig',
				tags: [],
				content: {
					contractEventId: 'contract-123',
					escrowId: '123',
					action: EscrowStatus.PendingCompletion,
					message: 'Completing...',
					transactionHash: '0x456',
					timestamp: now,
					type: 'contract-status'
				}
			} as unknown as ContractStatusEvent;

			const result = determineContractState(
				EscrowStatus.Funded,
				[pendingEvent],
				contract,
				escrowData,
				null,
				true, // isPending
				false,
				true
			);

			// All actions should be disabled during pending
			expect(result.permissions.canComplete).toBe(false);
			expect(result.permissions.canAccept).toBe(false);
			expect(result.permissions.canCancel).toBe(false);
		});
	});

	describe('Dispute Permissions', () => {
		it('should limit proposals to 2 per party', () => {
			const escrowData = createMockEscrowData(EscrowStatus.InDispute);
			const contract = createMockContract(EscrowStatus.InDispute);

			// Create 2 proposals from client
			const proposals: ContractStatusEvent[] = [
				{
					id: 'prop1',
					pubkey: clientPubkey,
					created_at: now,
					kind: 4,
					sig: 'sig',
					tags: [],
					content: {
						contractEventId: 'contract-123',
						escrowId: '123',
						action: EscrowStatus.DisputeResolutionProposed,
						message: 'Proposal 1',
						transactionHash: '0x111',
						timestamp: now,
						type: 'contract-status'
					}
				} as unknown as ContractStatusEvent,
				{
					id: 'prop2',
					pubkey: clientPubkey,
					created_at: now + 100,
					kind: 4,
					sig: 'sig',
					tags: [],
					content: {
						contractEventId: 'contract-123',
						escrowId: '123',
						action: EscrowStatus.DisputeResolutionProposed,
						message: 'Proposal 2',
						transactionHash: '0x222',
						timestamp: now + 100,
						type: 'contract-status'
					}
				} as unknown as ContractStatusEvent
			];

			const result = determineContractState(
				EscrowStatus.InDispute,
				proposals,
				contract,
				escrowData,
				null,
				false,
				true, // isClient
				false
			);

			// Client has reached proposal limit
			expect(result.permissions.canPropose).toBe(false);
		});

		it('should allow proposing when under limit', () => {
			const escrowData = createMockEscrowData(EscrowStatus.InDispute);
			const contract = createMockContract(EscrowStatus.InDispute);

			// Only 1 proposal from freelancer (client can propose)
			const proposals: ContractStatusEvent[] = [
				{
					id: 'prop1',
					pubkey: freelancerPubkey, // Freelancer proposed
					created_at: now,
					kind: 4,
					sig: 'sig',
					tags: [],
					content: {
						contractEventId: 'contract-123',
						escrowId: '123',
						action: EscrowStatus.DisputeResolutionProposed,
						message: 'Proposal 1',
						transactionHash: '0x111',
						timestamp: now,
						type: 'contract-status'
					}
				} as unknown as ContractStatusEvent
			];

			const result = determineContractState(
				EscrowStatus.InDispute,
				proposals,
				contract,
				escrowData,
				null,
				false,
				true, // isClient (can propose since freelancer was last proposer)
				false
			);

			// Client can propose (hasn't reached limit and wasn't last proposer)
			expect(result.permissions.canPropose).toBe(true);
		});
	});
});
