import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EscrowStatus } from '$lib/utils/escrow';
import { determineContractState } from '$lib/utils/helpers/contractPermissions';
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';
import type { NostrContract, ContractStatusEvent, NostrContractStatus } from '$lib/types/contract';

// Mock dependencies
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr.toLowerCase())
}));
vi.mock('$lib/nostr/task', () => ({
	updateTask: vi.fn().mockResolvedValue(undefined),
	getTaskStableId: vi.fn((task: { id?: string }) => task.id ?? 'task-id')
}));

vi.mock('svelte-i18n', () => {
	const mockT = Object.assign(
		vi.fn((key: string) => key),
		{ subscribe: vi.fn() }
	);
	return { t: mockT };
});

vi.mock('svelte/store', async () => {
	const actual = await vi.importActual<typeof import('svelte/store')>('svelte/store');
	const translationFn = (key: string) => key;
	const mockGet = vi.fn((store: unknown) => {
		if (typeof store === 'function') {
			const fnStore = store as { subscribe?: unknown; toString?: () => string };
			if (fnStore.subscribe || fnStore.toString?.().includes('t')) {
				return translationFn;
			}
			try {
				return (store as () => unknown)();
			} catch {
				return translationFn;
			}
		}
		return store;
	});
	return {
		...actual,
		get: mockGet
	};
});

describe('Escrow State Transitions Integration Tests', () => {
	const now = Math.floor(Date.now() / 1000);
	const clientPubkey = 'client-pubkey';
	const freelancerPubkey = 'freelancer-pubkey';
	const contractEventId = 'contract-123';
	const escrowId = '123';

	const createStatusContent = (
		action: EscrowStatus,
		message: string,
		transactionHash: string,
		overrides: Partial<NostrContractStatus> = {}
	): NostrContractStatus => ({
		contractEventId,
		escrowId,
		action,
		message,
		timestamp: now,
		type: 'contract-status',
		transactionHash,
		...overrides
	});

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
		estimatedStartTime: now + 3600, // Numbers, not BigInt (as returned by loadEscrowDetails)
		estimatedCompletionTime: now + 7200,
		completionTime: 0,
		timelockExpiry: now + 604800,
		clientFeeTier: 1,
		freelancerFeeTier: 1,
		createdAt: now * 1000, // Milliseconds (as returned by loadEscrowDetails)
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

	describe('State Transition: PendingFunding → Funded', () => {
		it('should transition from PendingFunding to Funded when transaction confirms', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Funded);
			const statusEvents: ContractStatusEvent[] = [];
			const contract = createMockContract(EscrowStatus.PendingFunding);

			const result = determineContractState(
				EscrowStatus.Funded,
				statusEvents,
				contract,
				escrowData,
				null,
				false,
				true, // isClient
				false // isFreelancer
			);

			expect(result.status).toBe(EscrowStatus.Funded);
			expect(result.permissions.canComplete).toBe(false); // Client can't complete
			expect(result.permissions.canAccept).toBe(false); // Not completed yet
			expect(result.permissions.canCancel).toBe(true); // Client can cancel
		});
	});

	describe('State Transition: Funded → InProgress → PendingCompletion → Completed', () => {
		it('should transition through work progression states', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Funded);
			const contract = createMockContract(EscrowStatus.Funded);

			// State 1: Funded (work hasn't started)
			let result = determineContractState(
				EscrowStatus.Funded,
				[],
				contract,
				escrowData,
				null,
				false,
				false, // isClient
				true // isFreelancer
			);

			expect(result.status).toBe(EscrowStatus.Funded);
			expect(result.permissions.canComplete).toBe(false); // Before start time

			// State 2: InProgress (past start time, not completed)
			const pastStartTime = now - 3600; // 1 hour ago
			const updatedEscrowData = createMockEscrowData(EscrowStatus.Funded, {
				estimatedStartTime: pastStartTime // Number
			});
			contract.estimatedStartTime = pastStartTime;

			result = determineContractState(
				EscrowStatus.Funded,
				[],
				contract,
				updatedEscrowData,
				null,
				false,
				false,
				true
			);

			expect(result.status).toBe(EscrowStatus.InProgress);
			expect(result.permissions.canComplete).toBe(true); // Freelancer can complete

			// State 3: PendingCompletion (transaction submitted)
			const pendingCompletionEvent: ContractStatusEvent = {
				id: 'event-1',
				pubkey: freelancerPubkey,
				created_at: now,
				kind: 4,
				sig: 'sig',
				tags: [],
				content: createStatusContent(EscrowStatus.PendingCompletion, 'Task completing...', '0x456')
			};

			result = determineContractState(
				EscrowStatus.Funded,
				[pendingCompletionEvent],
				contract,
				updatedEscrowData,
				null,
				true, // isPending
				false,
				true
			);

			expect(result.status).toBe(EscrowStatus.PendingCompletion);

			// State 4: Completed (blockchain confirms)
			const completedEscrowData = createMockEscrowData(EscrowStatus.Completed, {
				estimatedStartTime: pastStartTime, // Number
				timelockExpiry: now + 604800
			});

			result = determineContractState(
				EscrowStatus.Completed,
				[pendingCompletionEvent],
				contract,
				completedEscrowData,
				null,
				false,
				true, // isClient
				false
			);

			expect(result.status).toBe(EscrowStatus.Completed);
			expect(result.permissions.canAccept).toBe(true); // Client can accept
			expect(result.permissions.canDispute).toBe(true); // Client can dispute
		});
	});

	describe('State Transition: Completed → PendingAcceptance → FundsReleased', () => {
		it('should transition through acceptance flow', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Completed, {
				estimatedStartTime: now - 3600, // Number
				timelockExpiry: now + 604800
			});
			const contract = createMockContract(EscrowStatus.Completed);

			// State 1: Completed (waiting for acceptance)
			let result = determineContractState(
				EscrowStatus.Completed,
				[],
				contract,
				escrowData,
				null,
				false,
				true, // isClient
				false
			);

			expect(result.status).toBe(EscrowStatus.Completed);
			expect(result.permissions.canAccept).toBe(true);

			// State 2: PendingAcceptance (transaction submitted)
			const pendingAcceptanceEvent: ContractStatusEvent = {
				id: 'event-2',
				pubkey: clientPubkey,
				created_at: now,
				kind: 4,
				sig: 'sig',
				tags: [],
				content: createStatusContent(EscrowStatus.PendingAcceptance, 'Accepting task...', '0x789')
			};

			result = determineContractState(
				EscrowStatus.Completed,
				[pendingAcceptanceEvent],
				contract,
				escrowData,
				null,
				true, // isPending
				true,
				false
			);

			expect(result.status).toBe(EscrowStatus.PendingAcceptance);

			// State 3: FundsReleased (after confirmation - Nostr-only state)
			const fundsReleasedEvent: ContractStatusEvent = {
				id: 'event-3',
				pubkey: clientPubkey,
				created_at: now + 100,
				kind: 4,
				sig: 'sig',
				tags: [],
				content: createStatusContent(EscrowStatus.FundsReleased, 'Payment released', '0x789', {
					timestamp: now + 100
				})
			};

			result = determineContractState(
				EscrowStatus.Completed, // Blockchain still shows Completed
				[fundsReleasedEvent],
				contract,
				escrowData,
				null,
				false,
				true,
				false
			);

			expect(result.status).toBe(EscrowStatus.FundsReleased);
			expect(result.permissions.canAccept).toBe(false); // Already accepted
		});
	});

	describe('State Transition: Completed → PendingDispute → InDispute', () => {
		it('should transition through dispute flow', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Completed, {
				estimatedStartTime: now - 3600, // Number
				timelockExpiry: now + 604800
			});
			const contract = createMockContract(EscrowStatus.Completed);

			// State 1: Completed (can dispute)
			let result = determineContractState(
				EscrowStatus.Completed,
				[],
				contract,
				escrowData,
				null,
				false,
				true, // isClient
				false
			);

			expect(result.permissions.canDispute).toBe(true);

			// State 2: PendingDispute (transaction submitted)
			const pendingDisputeEvent: ContractStatusEvent = {
				id: 'event-4',
				pubkey: clientPubkey,
				created_at: now,
				kind: 4,
				sig: 'sig',
				tags: [],
				content: createStatusContent(EscrowStatus.PendingDispute, 'Raising dispute...', '0xdef')
			};

			result = determineContractState(
				EscrowStatus.Completed,
				[pendingDisputeEvent],
				contract,
				escrowData,
				null,
				true, // isPending
				true,
				false
			);

			expect(result.status).toBe(EscrowStatus.PendingDispute);

			// State 3: InDispute (blockchain confirms)
			const inDisputeEscrowData = createMockEscrowData(EscrowStatus.InDispute, {
				estimatedStartTime: now - 3600, // Number
				timelockExpiry: now + 604800
			});

			result = determineContractState(
				EscrowStatus.InDispute,
				[pendingDisputeEvent],
				contract,
				inDisputeEscrowData,
				null,
				false,
				true,
				false
			);

			expect(result.status).toBe(EscrowStatus.InDispute);
			expect(result.permissions.canPropose).toBe(true); // Can propose resolution
			expect(result.permissions.canAcceptProposal).toBe(false); // No proposal yet
		});
	});

	describe('State Transition: InDispute → DisputeResolutionProposed → DisputeResolved', () => {
		it('should transition through dispute resolution flow', () => {
			const escrowData = createMockEscrowData(EscrowStatus.InDispute, {
				estimatedStartTime: now - 3600, // Number
				timelockExpiry: now + 604800
			});
			const contract = createMockContract(EscrowStatus.InDispute);
			const disputeProposal: DisputeProposal = {
				escrowId: '123',
				freelancerAmount: '0.5',
				proposer: '0x1111111111111111111111111111111111111111',
				timestamp: now,
				accepted: false
			};

			// State 1: InDispute with proposal
			const proposalEvent: ContractStatusEvent = {
				id: 'event-5',
				pubkey: clientPubkey,
				created_at: now,
				kind: 4,
				sig: 'sig',
				tags: [],
				content: createStatusContent(
					EscrowStatus.DisputeResolutionProposed,
					'Proposal created',
					'0x111',
					{
						proposedClientAmount: '0.5',
						proposedFreelancerAmount: '0.5'
					}
				)
			};

			let result = determineContractState(
				EscrowStatus.InDispute,
				[proposalEvent],
				contract,
				escrowData,
				disputeProposal,
				false,
				false, // isClient
				true // isFreelancer
			);

			expect(result.status).toBe(EscrowStatus.DisputeResolutionProposed);
			expect(result.permissions.canAcceptProposal).toBe(true); // Freelancer can accept

			// State 2: DisputeResolved (after proposal acceptance)
			const resolvedEscrowData = createMockEscrowData(EscrowStatus.DisputeResolved, {
				estimatedStartTime: now - 3600, // Number
				timelockExpiry: now + 604800
			});

			const acceptEvent: ContractStatusEvent = {
				id: 'event-6',
				pubkey: freelancerPubkey,
				created_at: now + 100,
				kind: 4,
				sig: 'sig',
				tags: [],
				content: createStatusContent(EscrowStatus.DisputeResolved, 'Proposal accepted', '0x222', {
					timestamp: now + 100
				})
			};

			result = determineContractState(
				EscrowStatus.DisputeResolved,
				[proposalEvent, acceptEvent],
				contract,
				resolvedEscrowData,
				disputeProposal,
				false,
				true,
				false
			);

			expect(result.status).toBe(EscrowStatus.DisputeResolved);
			expect(result.permissions.canAcceptProposal).toBe(false); // Already resolved
		});
	});

	describe('State Transition: Funded → PendingCancellation → Cancelled', () => {
		it('should transition through cancellation flow', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Funded);
			const contract = createMockContract(EscrowStatus.Funded);

			// State 1: Funded (can cancel)
			let result = determineContractState(
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

			// State 2: PendingCancellation
			const pendingCancelEvent: ContractStatusEvent = {
				id: 'event-7',
				pubkey: clientPubkey,
				created_at: now,
				kind: 4,
				sig: 'sig',
				tags: [],
				content: createStatusContent(EscrowStatus.PendingCancellation, 'Cancelling...', '0xabc')
			};

			result = determineContractState(
				EscrowStatus.Funded,
				[pendingCancelEvent],
				contract,
				escrowData,
				null,
				true, // isPending
				true,
				false
			);

			expect(result.status).toBe(EscrowStatus.PendingCancellation);

			// State 3: Cancelled
			const cancelledEscrowData = createMockEscrowData(EscrowStatus.Cancelled);

			result = determineContractState(
				EscrowStatus.Cancelled,
				[pendingCancelEvent],
				contract,
				cancelledEscrowData,
				null,
				false,
				true,
				false
			);

			expect(result.status).toBe(EscrowStatus.Cancelled);
			expect(result.permissions.canCancel).toBe(false); // Already cancelled
		});
	});

	describe('Edge Cases in State Transitions', () => {
		it('should handle stale pending states', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Completed, {
				estimatedStartTime: now - 3600, // Number
				timelockExpiry: now + 604800
			});
			const contract = createMockContract(EscrowStatus.PendingCompletion);

			// Pending event from 1 hour ago, but blockchain shows Completed
			const stalePendingEvent: ContractStatusEvent = {
				id: 'event-stale',
				pubkey: freelancerPubkey,
				created_at: now - 3600, // 1 hour ago
				kind: 4,
				sig: 'sig',
				tags: [],
				content: createStatusContent(
					EscrowStatus.PendingCompletion,
					'Task completing...',
					'0xstale',
					{ timestamp: now - 3600 }
				)
			};

			const result = determineContractState(
				EscrowStatus.Completed, // Blockchain shows completed
				[stalePendingEvent],
				contract,
				escrowData,
				null,
				false, // Not pending anymore
				true,
				false
			);

			// Should use blockchain state, not stale pending state
			expect(result.status).toBe(EscrowStatus.Completed);
		});

		it('should handle missing blockchain data gracefully', () => {
			const contract = createMockContract(EscrowStatus.Funded);

			const result = determineContractState(
				null, // No blockchain status
				[],
				contract,
				null, // No escrow data
				null,
				false,
				true,
				false
			);

			// Should fall back to contract status
			expect(result.status).toBe(EscrowStatus.Funded);
		});

		it('should handle conflicting states (blockchain vs Nostr)', () => {
			const escrowData = createMockEscrowData(EscrowStatus.Completed, {
				estimatedStartTime: now - 3600, // Number
				timelockExpiry: now + 604800
			});
			const contract = createMockContract(EscrowStatus.Funded); // Contract says Funded

			const result = determineContractState(
				EscrowStatus.Completed, // Blockchain says Completed
				[],
				contract,
				escrowData,
				null,
				false,
				true,
				false
			);

			// Blockchain is source of truth
			expect(result.status).toBe(EscrowStatus.Completed);
		});
	});
});
