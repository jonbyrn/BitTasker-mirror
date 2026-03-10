import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { EscrowStatus } from '$lib/utils/escrow';

const {
	mockPublishEscrowStatus,
	mockHandleEscrowCreated,
	mockRegisterPendingContractByTxHash,
	mockCreateContract,
	mockPublishContractStatus,
	mockContractState
} = vi.hoisted(() => ({
	mockPublishEscrowStatus: vi.fn(),
	mockHandleEscrowCreated: vi.fn(),
	mockRegisterPendingContractByTxHash: vi.fn(),
	mockCreateContract: vi.fn(),
	mockPublishContractStatus: vi.fn(),
	mockContractState: { instance: null as unknown }
}));

// Mock dependencies
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr.toLowerCase())
}));
vi.mock('$lib/nostr/task', () => ({
	updateTask: vi.fn().mockResolvedValue(undefined),
	getTaskStableId: vi.fn((task: { id?: string }) => task.id ?? 'task-id')
}));

// Mock ethers
vi.mock('ethers', async () => {
	const actual = await vi.importActual<typeof import('ethers')>('ethers');
	return {
		...actual,
		ethers: {
			...actual.ethers,
			Contract: vi.fn().mockImplementation(() => mockContractState.instance)
		}
	};
});

// Mock wallet store
vi.mock('$lib/stores/wallet.store', () => ({
	getWallet: vi.fn(() => ({
		address: '0x1111111111111111111111111111111111111111'
	})),
	getProvider: vi.fn(() => ({
		getFeeData: vi.fn().mockResolvedValue({
			gasPrice: BigInt('1000000000')
		}),
		getBalance: vi.fn().mockResolvedValue(BigInt('1000000000000000000'))
	})),
	walletManager: {
		initialize: vi.fn()
	}
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		loadContractByEscrowId: vi.fn().mockResolvedValue(undefined)
	}
}));

// Mock Nostr contract
vi.mock('$lib/utils/escrow/v1/nostrContract', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/escrow/v1/nostrContract')>(
		'$lib/utils/escrow/v1/nostrContract'
	);
	return {
		...actual,
		createContractEvent: mockCreateContract,
		publishContractEvent: mockCreateContract,
		publishContractStatus: mockPublishContractStatus
	};
});

// Mock escrowEvents
vi.mock('$lib/utils/escrow/v1/escrowEvents', async () => {
	const actual = await vi.importActual('$lib/utils/escrow/v1/escrowEvents');
	return {
		...actual,
		handleEscrowCreated: vi.fn(async (...args: unknown[]) => {
			mockHandleEscrowCreated(...args);
			return (
				actual as { handleEscrowCreated: (...params: unknown[]) => Promise<void> }
			).handleEscrowCreated(...args);
		}),
		default: {
			handleEscrowCreated: vi.fn(async (...args: unknown[]) => {
				mockHandleEscrowCreated(...args);
				return (
					actual as { handleEscrowCreated: (...params: unknown[]) => Promise<void> }
				).handleEscrowCreated(...args);
			}),
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
		publishEscrowStatus: vi.fn(async (...args: unknown[]) => {
			mockPublishEscrowStatus(...args);
			return (
				actual as { publishEscrowStatus: (...params: unknown[]) => Promise<void> }
			).publishEscrowStatus(...args);
		}),
		registerPendingContractByTxHash: vi.fn((...args: unknown[]) => {
			mockRegisterPendingContractByTxHash(...args);
			return (
				actual as {
					registerPendingContractByTxHash: (...params: unknown[]) => void;
				}
			).registerPendingContractByTxHash(...args);
		})
	};
});

// Mock app store
vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showInfoToast: vi.fn(),
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	}
}));

// Mock svelte-i18n
vi.mock('svelte-i18n', () => {
	const mockT = Object.assign(
		vi.fn((key: string) => key),
		{ subscribe: vi.fn() }
	);
	return { t: mockT };
});

// Mock svelte/store
vi.mock('svelte/store', () => {
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
		get: mockGet,
		writable: vi.fn(() => ({
			set: vi.fn(),
			subscribe: vi.fn(),
			update: vi.fn()
		})),
		derived: vi.fn(() => ({ subscribe: vi.fn() }))
	};
});

// Import after mocks
import { escrow } from '$lib/utils/escrow/v1/escrow';
import * as EscrowNostrEvent from '$lib/utils/escrow/v1/escrowEvents';

describe('Escrow Event Flow Integration Tests', () => {
	let mockContract: {
		interface: { parseLog: ReturnType<typeof vi.fn> };
		createEscrow: ReturnType<typeof vi.fn>;
		completeTask: ReturnType<typeof vi.fn>;
		acceptTask: ReturnType<typeof vi.fn>;
		getEscrow: ReturnType<typeof vi.fn>;
		paused: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		vi.clearAllMocks();

		const createMockWait = (receipt: unknown) => {
			return vi
				.fn()
				.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(receipt), 10)));
		};

		mockContract = {
			interface: {
				parseLog: vi.fn()
			},
			createEscrow: vi.fn(),
			completeTask: vi.fn(),
			acceptTask: vi.fn(),
			getEscrow: vi.fn(),
			paused: vi.fn().mockResolvedValue(false)
		};

		const createMethodWithEstimateGas = (estimateGasValue: bigint, waitReceipt: unknown) => {
			const method = vi.fn().mockResolvedValue({
				hash: '0x' + Math.random().toString(16).substring(2, 66),
				wait: createMockWait(waitReceipt)
			});
			(method as unknown as { estimateGas: ReturnType<typeof vi.fn> }).estimateGas = vi
				.fn()
				.mockResolvedValue(estimateGasValue);
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

		mockContractState.instance = mockContract;
	});

	describe('Blockchain → Nostr Event Flow', () => {
		it('should publish pending status before transaction, confirmed after', async () => {
			const escrowId = '123';
			const contractEventId = 'contract-123';

			mockContract.getEscrow.mockResolvedValue({
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: ethers.parseEther('1.0'),
				state: EscrowStatus.Funded,
				estimatedStartTime: BigInt(Math.floor(Date.now() / 1000) + 3600),
				estimatedCompletionTime: BigInt(Math.floor(Date.now() / 1000) + 7200),
				timelockEnd: BigInt(Math.floor(Date.now() / 1000) + 604800),
				clientFeeTier: 1,
				freelancerFeeTier: 1,
				createdAt: BigInt(Math.floor(Date.now() / 1000))
			});

			// Complete task
			await escrow.completeTask(escrowId, contractEventId);

			// Should publish pending status immediately
			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingCompletion
				})
			);

			// Wait for confirmation
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should publish confirmed status after confirmation
			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.Completed
				})
			);
		});

		it('should handle EscrowCreated event and create Nostr contract', async () => {
			const escrowId = '456';
			const txHash = '0x789';
			const clientAddress = '0x1111111111111111111111111111111111111111';
			const freelancerAddress = '0x2222222222222222222222222222222222222222';
			const amount = ethers.parseEther('1.0').toString();

			mockCreateContract.mockResolvedValue(undefined);
			await EscrowNostrEvent.registerPendingContractByTxHash({
				bidEventId: 'bid-456',
				taskId: 'task-456',
				taskTitle: 'Event Flow Task',
				taskDescription: 'Event flow task description',
				freelancerPubkey: freelancerAddress,
				amount,
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: txHash
			});

			// Simulate EscrowCreated event from blockchain
			await EscrowNostrEvent.handleEscrowCreated({
				escrowId,
				transactionHash: txHash,
				client: clientAddress,
				freelancer: freelancerAddress,
				amount
			});

			// Should create Nostr contract
			expect(mockCreateContract).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					transactionHash: txHash,
					freelancerPubkey: expect.any(String)
				})
			);
		});

		it('should propagate status updates through Nostr events', async () => {
			const escrowId = '789';
			const contractEventId = 'contract-789';

			// Simulate status update flow
			await EscrowNostrEvent.publishEscrowStatus({
				escrowId,
				contractEventId,
				transactionHash: '0xabc',
				status: EscrowStatus.PendingCompletion
			});

			expect(mockPublishContractStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					action: EscrowStatus.PendingCompletion
				})
			);

			// Simulate confirmed status
			await EscrowNostrEvent.publishEscrowStatus({
				escrowId,
				contractEventId,
				transactionHash: '0xabc',
				status: EscrowStatus.Completed
			});

			expect(mockPublishContractStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					action: EscrowStatus.Completed
				})
			);
		});
	});

	describe('Event Ordering and Timing', () => {
		it('should handle rapid state changes correctly', async () => {
			const escrowId = 'rapid';
			const contractEventId = 'contract-rapid';

			mockContract.getEscrow.mockResolvedValue({
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: ethers.parseEther('1.0'),
				state: EscrowStatus.Completed,
				estimatedStartTime: BigInt(Math.floor(Date.now() / 1000) - 3600),
				estimatedCompletionTime: BigInt(Math.floor(Date.now() / 1000)),
				timelockEnd: BigInt(Math.floor(Date.now() / 1000) + 604800),
				clientFeeTier: 1,
				freelancerFeeTier: 1,
				createdAt: BigInt(Math.floor(Date.now() / 1000) - 7200)
			});

			// Complete task
			const completeResult = await escrow.completeTask(escrowId, contractEventId);

			// Immediately try to accept (should work after completion)
			const acceptResult = await escrow.acceptTask(escrowId, contractEventId);

			expect(completeResult.hash).toBeDefined();
			expect(acceptResult.hash).toBeDefined();

			// Wait for both to confirm
			await new Promise((resolve) => setTimeout(resolve, 150));

			// Both should have published statuses
			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({ status: EscrowStatus.PendingCompletion })
			);
			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({ status: EscrowStatus.PendingAcceptance })
			);
		});
	});

	describe('Error Event Handling', () => {
		it('should handle transaction failures and publish error status', async () => {
			const escrowId = 'error';
			const contractEventId = 'contract-error';

			// Mock transaction failure
			mockContract.completeTask.mockRejectedValueOnce(new Error('Transaction failed'));

			await expect(escrow.completeTask(escrowId, contractEventId)).rejects.toThrow();

			// Should not publish pending status if transaction fails immediately
			// (The function throws before publishing)
		});

		it('should handle Nostr publish failures gracefully', async () => {
			mockPublishContractStatus.mockRejectedValueOnce(new Error('Nostr publish failed'));

			// Should not throw, but log error
			await EscrowNostrEvent.publishEscrowStatus({
				escrowId: '123',
				contractEventId: 'contract-123',
				transactionHash: '0x123',
				status: EscrowStatus.Completed
			});

			// Function should complete (error is caught internally)
			expect(mockPublishContractStatus).toHaveBeenCalled();
		});
	});
});
