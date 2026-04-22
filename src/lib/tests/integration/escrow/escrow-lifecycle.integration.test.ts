import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import type { NostrBidContent, NostrEventWithFollowup } from '$lib/types/bid';
import type { Task } from '$lib/types/task';
import type { NostrEvent } from 'nostr-tools';
import { EscrowStatus } from '$lib/utils/escrow';
import type { Mock } from 'vitest';

/** Minimal receipt shape returned by `tx.wait()` in escrow integration mocks */
export type EscrowMockTxReceipt = {
	hash: string;
	gasUsed: bigint;
	logs: unknown[];
};

/** Contract method mock with ethers-style `estimateGas` sibling */
export type EscrowMethodMock = Mock & { estimateGas: Mock };

/** Shared mock contract surface for v1 escrow integration tests */
export type EscrowV1IntegrationMockContract = {
	interface: { parseLog: Mock };
	getEscrow: Mock;
	paused: Mock;
	createEscrow?: EscrowMethodMock;
	completeTask?: EscrowMethodMock;
	acceptTask?: EscrowMethodMock;
	cancelEscrow?: EscrowMethodMock;
	disputeTask?: EscrowMethodMock;
	proposeResolution?: EscrowMethodMock;
	acceptProposal?: EscrowMethodMock;
	resolveAfterTimelock?: EscrowMethodMock;
	getDisputeProposal?: Mock;
};

// Mock @bittasker/wallet-core
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr.toLowerCase())
}));

// Mock ethers
let mockContractInstance: EscrowV1IntegrationMockContract | null = null;
vi.mock('ethers', async () => {
	const actual = await vi.importActual('ethers');
	return {
		...actual,
		ethers: {
			...actual.ethers,
			Contract: vi.fn().mockImplementation(() => {
				return mockContractInstance;
			})
		}
	};
});

// Mock wallet store
const mockWalletStore = {
	rsk: {
		connected: true,
		balance: ethers.parseEther('10.0').toString(),
		contractConnected: true
	},
	bsc: {
		connected: false,
		balance: null
	}
};

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: {
		subscribe: vi.fn((callback) => {
			callback(mockWalletStore);
			return () => {};
		})
	},
	getWallet: vi.fn(() => ({
		address: '0x1111111111111111111111111111111111111111',
		signTransaction: vi.fn()
	})),
	getProvider: vi.fn(() => ({
		getFeeData: vi.fn().mockResolvedValue({
			gasPrice: BigInt('1000000000')
		}),
		getTransactionReceipt: vi.fn(),
		getBalance: vi.fn().mockResolvedValue(BigInt('1000000000000000000'))
	})),
	walletManager: {
		initialize: vi.fn()
	}
}));

// Mock network config
vi.mock('@bittasker/wallet-core', () => ({
	FEE_TIERS: {
		1: { percentage: 250, label: '2.5%' },
		2: { percentage: 200, label: '2.0%' },
		3: { percentage: 150, label: '1.5%' }
	}
}));

// Mock escrowEvents
const { mockPublishEscrowStatus, mockHandleEscrowCreated, mockRegisterPendingContractByTxHash, mockCleanupPendingContractByTxHash } = vi.hoisted(() => ({
	mockPublishEscrowStatus: vi.fn(),
	mockHandleEscrowCreated: vi.fn(),
	mockRegisterPendingContractByTxHash: vi.fn(),
	mockCleanupPendingContractByTxHash: vi.fn()
}));

vi.mock('$lib/utils/escrow/v1/escrowEvents', async () => {
	const actual = await vi.importActual('$lib/utils/escrow/v1/escrowEvents');
	return {
		...actual,
		default: {
			handleEscrowCreated: mockHandleEscrowCreated,
			publishPendingCompletion: vi.fn(),
			handleTaskCompleted: vi.fn(),
			publishPendingAcceptance: vi.fn(),
			handleTaskAccepted: vi.fn(),
			publishPendingCancellation: vi.fn(),
			handleEscrowCancelled: vi.fn(),
			publishPendingDispute: vi.fn(),
			handleTaskDisputed: vi.fn(),
			handleResolutionProposed: vi.fn(),
			handleProposalAccepted: vi.fn(),
			handleTimelockResolved: vi.fn()
		},
		publishEscrowStatus: mockPublishEscrowStatus,
		registerPendingContractByTxHash: mockRegisterPendingContractByTxHash,
		cleanupPendingContractByTxHash: mockCleanupPendingContractByTxHash,
		contractCreationStore: { subscribe: vi.fn() }
	};
});

// Mock Nostr contract
const { mockCreateContract, mockPublishContractEvent, mockPublishContractStatus, mockGetContracts, mockDeleteContract, mockHandleStatusEvent, mockHandleContractEvent } = vi.hoisted(() => ({
	mockCreateContract: vi.fn(),
	mockPublishContractEvent: vi.fn(),
	mockPublishContractStatus: vi.fn(),
	mockGetContracts: vi.fn().mockResolvedValue([]),
	mockDeleteContract: vi.fn(),
	mockHandleStatusEvent: vi.fn(),
	mockHandleContractEvent: vi.fn()
}));

vi.mock('$lib/utils/escrow/v1/nostrContract', () => ({
	createContractEvent: mockCreateContract,
	publishContractEvent: mockPublishContractEvent,
	publishContractStatus: mockPublishContractStatus,
	getContracts: mockGetContracts,
	deleteContract: mockDeleteContract,
	handleStatusEvent: mockHandleStatusEvent,
	handleContractEvent: mockHandleContractEvent
}));

// Mock app store
vi.mock('$lib/stores/app.store', () => {
	const mockPool = {
		publish: vi.fn(),
		subscribe: vi.fn(),
		close: vi.fn()
	};
	return {
		appStore: {
			showInfoToast: vi.fn(),
			showSuccessToast: vi.fn(),
			showErrorToast: vi.fn(),
			pool: mockPool
		}
	};
});

// Mock svelte-i18n
vi.mock('svelte-i18n', () => {
	const mockT = Object.assign(
		vi.fn((key: string) => key),
		{
			subscribe: vi.fn()
		}
	);
	return {
		t: mockT
	};
});

// Mock svelte/store
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
		})),
		derived: vi.fn(() => ({
			subscribe: vi.fn()
		}))
	};
});

// Mock contract error handler
vi.mock('$lib/utils/wallet/contractErrorHandler', () => ({
	extractContractError: vi.fn((error) => ({
		userMessage: error instanceof Error ? error.message : 'Unknown error',
		code: 'UNKNOWN_ERROR'
	}))
}));

// Now import after mocks
import { escrow } from '$lib/utils/escrow/v1/escrow';
import { acceptBidAndCreateEscrow } from '$lib/utils/escrow/v1/escrowBid';
import * as EscrowNostrEvent from '$lib/utils/escrow/v1/escrowEvents';

const NOSTR_PEER_HEX = 'aa'.repeat(32);

describe('Escrow Lifecycle Integration Tests', () => {
	let mockContract: EscrowV1IntegrationMockContract;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock transaction with async wait
		const createMockWait = (receipt: EscrowMockTxReceipt) => {
			return vi.fn().mockImplementation(
				() =>
					new Promise((resolve) => {
						setTimeout(() => resolve(receipt), 10);
					})
			);
		};

		// Setup mock contract
		mockContract = {
			interface: {
				parseLog: vi.fn()
			},
			createEscrow: vi.fn(),
			completeTask: vi.fn(),
			acceptTask: vi.fn(),
			cancelEscrow: vi.fn(),
			disputeTask: vi.fn(),
			proposeResolution: vi.fn(),
			acceptProposal: vi.fn(),
			resolveAfterTimelock: vi.fn(),
			getEscrow: vi.fn(),
			getDisputeProposal: vi.fn(),
			paused: vi.fn().mockResolvedValue(false)
		};

		// Setup method mocks with estimateGas
		const createMethodWithEstimateGas = (
			estimateGasValue: bigint,
			waitReceipt: EscrowMockTxReceipt
		) => {
			const method = vi.fn().mockResolvedValue({
				hash: '0x' + Math.random().toString(16).substring(2, 66),
				wait: createMockWait(waitReceipt)
			});
			method.estimateGas = vi.fn().mockResolvedValue(estimateGasValue);
			return method;
		};

		mockContract.createEscrow = createMethodWithEstimateGas(BigInt(100000), {
			hash: '0x123',
			gasUsed: BigInt(100000),
			logs: []
		});

		mockContract.completeTask = createMethodWithEstimateGas(BigInt(50000), {
			hash: '0x456',
			gasUsed: BigInt(50000),
			logs: []
		});

		mockContract.acceptTask = createMethodWithEstimateGas(BigInt(40000), {
			hash: '0x789',
			gasUsed: BigInt(40000),
			logs: []
		});

		mockContract.cancelEscrow = createMethodWithEstimateGas(BigInt(30000), {
			hash: '0xabc',
			gasUsed: BigInt(30000),
			logs: []
		});

		mockContract.disputeTask = createMethodWithEstimateGas(BigInt(35000), {
			hash: '0xdef',
			gasUsed: BigInt(35000),
			logs: []
		});

		mockContract.proposeResolution = createMethodWithEstimateGas(BigInt(45000), {
			hash: '0x111',
			gasUsed: BigInt(45000),
			logs: []
		});

		mockContract.acceptProposal = createMethodWithEstimateGas(BigInt(40000), {
			hash: '0x222',
			gasUsed: BigInt(40000),
			logs: []
		});

		mockContract.resolveAfterTimelock = createMethodWithEstimateGas(BigInt(50000), {
			hash: '0x333',
			gasUsed: BigInt(50000),
			logs: []
		});

		mockContract.getEscrow = vi.fn();
		mockContract.getDisputeProposal = vi.fn();

		mockContractInstance = mockContract;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Complete Escrow Lifecycle - Happy Path', () => {
		it('should handle full lifecycle: bid acceptance → escrow creation → completion → acceptance', async () => {
			const escrowId = '123';
			const freelancerAddress = '0x2222222222222222222222222222222222222222';
			const baseAmount = '1.0';
			const now = Math.floor(Date.now() / 1000);
			const startTime = now + 3600;
			const completionTime = now + 7200;

			// Setup mock bid and task
			const mockBid: NostrEventWithFollowup = {
				id: 'bid-123',
				content: {
					bidderId: 'npub1freelancer',
					amount: 100,
					currency: 'USD',
					estimatedHours: 2
				} as unknown as NostrBidContent,
				pubkey: 'npub1freelancer',
				created_at: now,
				kind: 1,
				sig: 'sig',
				tags: []
			};

			const mockTask: NostrEvent = {
				id: 'task-123',
				content: JSON.stringify({
					title: 'Test Task',
					description: 'Test Description',
					budget: { amount: 100, currency: 'USD', type: 'fixed' }
				} as Task),
				pubkey: 'npub1client',
				created_at: now - 3600,
				kind: 1,
				sig: 'sig',
				tags: []
			};

			// Mock escrow data for different states
			const fundedEscrowData = {
				client: '0x1111111111111111111111111111111111111111',
				freelancer: freelancerAddress,
				amount: ethers.parseEther(baseAmount),
				state: EscrowStatus.Funded,
				estimatedStartTime: BigInt(startTime),
				estimatedCompletionTime: BigInt(completionTime),
				timelockEnd: BigInt(completionTime + 604800),
				clientFeeTier: 1,
				freelancerFeeTier: 1,
				createdAt: BigInt(now)
			};

			const completedEscrowData = {
				...fundedEscrowData,
				state: EscrowStatus.Completed
			};

			// Step 1: Accept bid and create escrow
			mockContract.getEscrow.mockResolvedValueOnce(fundedEscrowData);
			mockCreateContract.mockResolvedValue(undefined);

			const bidResult = await acceptBidAndCreateEscrow(mockBid, mockTask, 65000, 'RSK');

			expect(bidResult.success).toBe(true);
			expect(bidResult.transactionResult).toBeDefined();
			expect(mockRegisterPendingContractByTxHash).toHaveBeenCalled();

			// Simulate blockchain confirmation and event handling
			const txHash = bidResult.transactionResult!.hash;
			await EscrowNostrEvent.default.handleEscrowCreated({
				escrowId,
				transactionHash: txHash,
				client: '0x1111111111111111111111111111111111111111',
				freelancer: freelancerAddress,
				amount: ethers.parseEther(baseAmount).toString()
			});

			expect(mockHandleEscrowCreated).toHaveBeenCalled();
			expect(mockCreateContract).toHaveBeenCalled();

			// Step 2: Freelancer completes task
			mockContract.getEscrow.mockResolvedValueOnce(completedEscrowData);
			const contractEventId = 'contract-123';

			const completeResult = await escrow.completeTask(escrowId, NOSTR_PEER_HEX, contractEventId);

			expect(completeResult.hash).toBeDefined();
			expect(completeResult.status).toBe('pending');
			expect(completeResult.escrowId).toBe(escrowId);

			// Wait for async confirmation
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingCompletion
				})
			);

			// Step 3: Client accepts task
			mockContract.getEscrow.mockResolvedValueOnce(completedEscrowData);

			const acceptResult = await escrow.acceptTask(escrowId, NOSTR_PEER_HEX, contractEventId);

			expect(acceptResult.hash).toBeDefined();
			expect(acceptResult.status).toBe('pending');

			// Wait for async confirmation
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingAcceptance
				})
			);
		});

		it('should handle lifecycle with cancellation before completion', async () => {
			const escrowId = '456';
			const freelancerAddress = '0x2222222222222222222222222222222222222222';
			const baseAmount = '0.5';
			const now = Math.floor(Date.now() / 1000);
			const startTime = now + 86400; // 24 hours in future

			const fundedEscrowData = {
				client: '0x1111111111111111111111111111111111111111',
				freelancer: freelancerAddress,
				amount: ethers.parseEther(baseAmount),
				state: EscrowStatus.Funded,
				estimatedStartTime: BigInt(startTime),
				estimatedCompletionTime: BigInt(startTime + 3600),
				timelockEnd: BigInt(startTime + 604800),
				clientFeeTier: 2,
				freelancerFeeTier: 2,
				createdAt: BigInt(now)
			};

			mockContract.getEscrow.mockResolvedValue(fundedEscrowData);

			// Create escrow
			const createResult = await escrow.createEscrow(
				freelancerAddress,
				baseAmount,
				startTime,
				startTime + 3600,
				2,
				2
			);

			expect(createResult.hash).toBeDefined();

			// Cancel escrow
			const contractEventId = 'contract-456';
			const cancelResult = await escrow.cancelEscrow(escrowId, NOSTR_PEER_HEX, contractEventId);

			expect(cancelResult.hash).toBeDefined();
			expect(cancelResult.status).toBe('pending');

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingCancellation
				})
			);
		});
	});

	describe('Dispute Resolution Lifecycle', () => {
		it('should handle dispute → proposal → acceptance flow', async () => {
			const escrowId = '789';
			const freelancerAddress = '0x2222222222222222222222222222222222222222';
			const now = Math.floor(Date.now() / 1000);

			const completedEscrowData = {
				client: '0x1111111111111111111111111111111111111111',
				freelancer: freelancerAddress,
				amount: ethers.parseEther('1.0'),
				state: EscrowStatus.Completed,
				estimatedStartTime: BigInt(now - 3600),
				estimatedCompletionTime: BigInt(now),
				timelockEnd: BigInt(now + 604800),
				clientFeeTier: 1,
				freelancerFeeTier: 1,
				createdAt: BigInt(now - 7200)
			};

			const inDisputeEscrowData = {
				...completedEscrowData,
				state: EscrowStatus.InDispute
			};

			const mockDisputeProposal = {
				freelancerAmount: ethers.parseEther('0.5').toString(),
				proposer: '0x1111111111111111111111111111111111111111',
				proposedAt: BigInt(now)
			};

			mockContract.getEscrow.mockResolvedValue(completedEscrowData);
			mockContract.getDisputeProposal.mockResolvedValue(mockDisputeProposal);

			const contractEventId = 'contract-789';

			// Step 1: Client disputes completed task
			const disputeResult = await escrow.disputeTask(escrowId, NOSTR_PEER_HEX, contractEventId);

			expect(disputeResult.hash).toBeDefined();
			expect(disputeResult.status).toBe('pending');

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingDispute
				})
			);

			// Step 2: Client proposes resolution
			mockContract.getEscrow.mockResolvedValue(inDisputeEscrowData);

			const proposeResult = await escrow.proposeResolution(
				escrowId,
				NOSTR_PEER_HEX,
				'0.5',
				contractEventId,
				'0.5',
				'0.5'
			);

			expect(proposeResult.hash).toBeDefined();
			expect(proposeResult.status).toBe('pending');

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingResolutionProposal,
					proposedClientAmount: '0.5',
					proposedFreelancerAmount: '0.5'
				})
			);

			// Step 3: Freelancer accepts proposal
			const acceptProposalResult = await escrow.acceptProposal(
				escrowId,
				NOSTR_PEER_HEX,
				contractEventId
			);

			expect(acceptProposalResult.hash).toBeDefined();
			expect(acceptProposalResult.status).toBe('pending');

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingProposalAcceptance
				})
			);
		});

		it('should handle timelock expiration resolution', async () => {
			const escrowId = '999';
			const now = Math.floor(Date.now() / 1000);

			const inDisputeEscrowData = {
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: ethers.parseEther('1.0'),
				state: EscrowStatus.InDispute,
				estimatedStartTime: BigInt(now - 604800),
				estimatedCompletionTime: BigInt(now - 518400),
				timelockEnd: BigInt(now - 86400), // Expired
				clientFeeTier: 1,
				freelancerFeeTier: 1,
				createdAt: BigInt(now - 691200)
			};

			mockContract.getEscrow.mockResolvedValue(inDisputeEscrowData);

			const contractEventId = 'contract-999';
			const resolveResult = await escrow.resolveAfterTimelock(
				escrowId,
				NOSTR_PEER_HEX,
				EscrowStatus.InDispute,
				contractEventId
			);

			expect(resolveResult.hash).toBeDefined();
			expect(resolveResult.status).toBe('pending');

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingTimelockResolution
				})
			);
		});
	});

	describe('Error Handling in Lifecycle', () => {
		it('should handle escrow creation failure gracefully', async () => {
			mockContract.createEscrow.estimateGas.mockRejectedValueOnce(new Error('Insufficient funds'));

			await expect(
				escrow.createEscrow(
					'0x2222222222222222222222222222222222222222',
					'1.0',
					Math.floor(Date.now() / 1000) + 3600,
					Math.floor(Date.now() / 1000) + 7200,
					1,
					1
				)
			).rejects.toThrow();
		});

		it('should handle task completion failure', async () => {
			mockContract.completeTask.estimateGas.mockRejectedValueOnce(
				new Error('Task already completed')
			);

			await expect(escrow.completeTask('123', NOSTR_PEER_HEX, 'contract-123')).rejects.toThrow();
		});

		it('should handle bid acceptance with invalid data', async () => {
			const invalidBid: NostrEventWithFollowup = {
				id: 'bid-invalid',
				content: {
					bidderId: 'npub1freelancer',
					amount: 0, // Invalid: amount must be > 0
					currency: 'USD',
					estimatedHours: 2
				} as unknown as NostrBidContent,
				pubkey: 'npub1freelancer',
				created_at: Math.floor(Date.now() / 1000),
				kind: 1,
				sig: 'sig',
				tags: []
			};

			const mockTask: NostrEvent = {
				id: 'task-invalid',
				content: JSON.stringify({
					title: 'Test Task',
					description: 'Test Description',
					budget: { amount: 0, currency: 'USD', type: 'fixed' } // Invalid
				} as Task),
				pubkey: 'npub1client',
				created_at: Math.floor(Date.now() / 1000),
				kind: 1,
				sig: 'sig',
				tags: []
			};

			const result = await acceptBidAndCreateEscrow(invalidBid, mockTask, 65000, 'RSK');

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});
});
