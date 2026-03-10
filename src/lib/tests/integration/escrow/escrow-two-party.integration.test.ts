/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { EscrowStatus } from '$lib/utils/escrow';

const {
	mockPublishEscrowStatus,
	mockHandleEscrowCreated,
	mockRegisterPendingContractByTxHash,
	mockCreateContract,
	mockContractState
} = vi.hoisted(() => ({
	mockPublishEscrowStatus: vi.fn(),
	mockHandleEscrowCreated: vi.fn(),
	mockRegisterPendingContractByTxHash: vi.fn(),
	mockCreateContract: vi.fn(),
	mockContractState: { instance: null as unknown }
}));

// Mock dependencies
vi.mock('@bittasker/wallet-core', () => ({
	FEE_TIERS: {
		1: { percentage: 250, label: '2.5%' },
		2: { percentage: 200, label: '2.0%' },
		3: { percentage: 150, label: '1.5%' }
	},
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

// Mock wallet store - simulate two different users
const createMockWalletStore = (user: 'client' | 'freelancer') => {
	if (user === 'client') {
		return {
			rsk: {
				connected: true,
				balance: ethers.parseEther('10.0').toString(),
				contractConnected: true
			}
		};
	} else {
		return {
			rsk: {
				connected: true,
				balance: ethers.parseEther('5.0').toString(),
				contractConnected: true
			}
		};
	}
};

let currentUser: 'client' | 'freelancer' = 'client';

vi.mock('$lib/stores/wallet.store', () => ({
	getWallet: vi.fn(() => {
		if (currentUser === 'client') {
			return {
				address: '0x1111111111111111111111111111111111111111'
			};
		} else {
			return {
				address: '0x2222222222222222222222222222222222222222'
			};
		}
	}),
	getProvider: vi.fn(() => ({
		getFeeData: vi.fn().mockResolvedValue({
			gasPrice: BigInt('1000000000')
		}),
		getBalance: vi.fn().mockResolvedValue(BigInt('1000000000000000000'))
	})),
	walletStore: {
		subscribe: vi.fn((callback) => {
			callback(createMockWalletStore(currentUser));
			return () => {};
		})
	},
	walletManager: {
		initialize: vi.fn()
	}
}));

// Mock escrowEvents
vi.mock('$lib/utils/escrow/v1/escrowEvents', async () => {
	const actual = await vi.importActual('$lib/utils/escrow/v1/escrowEvents');
	return {
		...actual,
		handleEscrowCreated: mockHandleEscrowCreated,
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
		registerPendingContractByTxHash: mockRegisterPendingContractByTxHash
	};
});

// Mock Nostr contract
vi.mock('$lib/utils/escrow/v1/nostrContract', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/escrow/v1/nostrContract')>(
		'$lib/utils/escrow/v1/nostrContract'
	);
	return {
		...actual,
		createContractEvent: mockCreateContract,
		publishContractEvent: mockCreateContract,
		publishContractStatus: vi.fn()
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
	const mockGet = vi.fn((store: any) => {
		if (typeof store === 'function') {
			if (store.subscribe || (store.toString && store.toString().includes('t'))) {
				return translationFn;
			}
			try {
				return store();
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

describe('Escrow Two-Party Interaction Integration Tests', () => {
	let mockContract: any;
	const escrowId = 'two-party-123';
	const contractEventId = 'contract-two-party-123';
	const clientAddress = '0x1111111111111111111111111111111111111111';
	const freelancerAddress = '0x2222222222222222222222222222222222222222';
	const baseAmount = '1.0';
	const now = Math.floor(Date.now() / 1000);
	const startTime = now + 3600;
	const completionTime = now + 7200;
	let disputeProposalProposer: string | null = null;

	beforeEach(() => {
		vi.clearAllMocks();
		currentUser = 'client'; // Start as client
		disputeProposalProposer = null;

		const createMockWait = (receipt: any) => {
			return vi
				.fn()
				.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(receipt), 10)));
		};

		const getCurrentActorAddress = () =>
			currentUser === 'client' ? clientAddress.toLowerCase() : freelancerAddress.toLowerCase();

		const createMethodWithEstimateGas = (
			estimateGasValue: bigint,
			waitReceipt: any,
			options?: {
				allow?: () => boolean;
				errorMessage?: string;
				onExecute?: () => void;
			}
		) => {
			const allow = options?.allow ?? (() => true);
			const errorMessage = options?.errorMessage ?? 'Contract call reverted';
			const onExecute = options?.onExecute;

			const method = vi.fn().mockImplementation(async () => {
				if (!allow()) {
					throw new Error(errorMessage);
				}
				onExecute?.();
				return {
					hash: `0x${Math.random().toString(16).slice(2)}`,
					wait: createMockWait(waitReceipt)
				};
			});

			(method as unknown as { estimateGas: ReturnType<typeof vi.fn> }).estimateGas = vi
				.fn()
				.mockImplementation(async () => {
					if (!allow()) {
						throw new Error(errorMessage);
					}
					return estimateGasValue;
				});

			return method;
		};

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
			getEscrow: vi.fn(),
			getDisputeProposal: vi.fn(),
			paused: vi.fn().mockResolvedValue(false)
		};

		mockContract.createEscrow = createMethodWithEstimateGas(100000n, {
			hash: '0xcreate',
			gasUsed: 100000n,
			logs: []
		});

		mockContract.completeTask = createMethodWithEstimateGas(
			50000n,
			{
				hash: '0xcomplete',
				gasUsed: 50000n,
				logs: []
			},
			{
				allow: () => currentUser === 'freelancer',
				errorMessage: 'Only freelancer can complete task'
			}
		);

		mockContract.acceptTask = createMethodWithEstimateGas(
			40000n,
			{
				hash: '0xaccept',
				gasUsed: 40000n,
				logs: []
			},
			{
				allow: () => currentUser === 'client',
				errorMessage: 'Only client can accept task'
			}
		);

		mockContract.cancelEscrow = createMethodWithEstimateGas(45000n, {
			hash: '0xcancel',
			gasUsed: 45000n,
			logs: []
		});

		mockContract.disputeTask = createMethodWithEstimateGas(55000n, {
			hash: '0xdispute',
			gasUsed: 55000n,
			logs: []
		});

		mockContract.proposeResolution = createMethodWithEstimateGas(
			60000n,
			{
				hash: '0xpropose',
				gasUsed: 60000n,
				logs: []
			},
			{
				onExecute: () => {
					disputeProposalProposer = getCurrentActorAddress();
				}
			}
		);

		mockContract.acceptProposal = createMethodWithEstimateGas(
			52000n,
			{
				hash: '0xacceptproposal',
				gasUsed: 52000n,
				logs: []
			},
			{
				allow: () => disputeProposalProposer !== getCurrentActorAddress(),
				errorMessage: 'Proposer cannot accept own resolution'
			}
		);

		mockContract.getDisputeProposal.mockImplementation(async () => {
			if (!disputeProposalProposer) {
				return {
					proposer: ethers.ZeroAddress,
					freelancerAmount: 0n,
					timestamp: 0n,
					accepted: false
				};
			}
			return {
				proposer: disputeProposalProposer,
				freelancerAmount: ethers.parseEther('0.5'),
				timestamp: BigInt(Math.floor(Date.now() / 1000)),
				accepted: false
			};
		});

		mockContractState.instance = mockContract;
	});

	describe('Client-Freelancer Interaction Flow', () => {
		it('should handle client creates escrow, freelancer completes, client accepts', async () => {
			// Setup escrow data for different states
			const fundedEscrowData = {
				client: clientAddress,
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

			// Step 1: Client creates escrow
			currentUser = 'client';
			mockContract.getEscrow.mockResolvedValueOnce(fundedEscrowData);
			mockCreateContract.mockResolvedValue(undefined);

			const createResult = await escrow.createEscrow(
				freelancerAddress,
				baseAmount,
				startTime,
				completionTime,
				1,
				1
			);

			expect(createResult.hash).toBeDefined();
			expect(createResult.status).toBe('pending');
			expect(mockContract.createEscrow.estimateGas).toHaveBeenCalled();
			expect(mockContract.createEscrow).toHaveBeenCalledWith(
				freelancerAddress,
				startTime,
				completionTime,
				1,
				1,
				expect.objectContaining({
					value: ethers.parseEther('1.025')
				})
			);

			// Simulate blockchain confirmation
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Simulate EscrowCreated event handling
			await EscrowNostrEvent.handleEscrowCreated({
				escrowId,
				transactionHash: createResult.hash,
				client: clientAddress,
				freelancer: freelancerAddress,
				amount: ethers.parseEther(baseAmount).toString()
			});

			expect(mockHandleEscrowCreated).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					client: clientAddress,
					freelancer: freelancerAddress
				})
			);

			// Step 2: Freelancer completes task
			currentUser = 'freelancer';
			mockContract.getEscrow.mockResolvedValueOnce(completedEscrowData);

			const completeResult = await escrow.completeTask(escrowId, contractEventId);

			expect(completeResult.hash).toBeDefined();
			expect(completeResult.status).toBe('pending');
			expect(completeResult.escrowId).toBe(escrowId);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingCompletion
				})
			);

			// Step 3: Client accepts task
			currentUser = 'client';
			mockContract.getEscrow.mockResolvedValueOnce(completedEscrowData);

			const acceptResult = await escrow.acceptTask(escrowId, contractEventId);

			expect(acceptResult.hash).toBeDefined();
			expect(acceptResult.status).toBe('pending');

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingAcceptance
				})
			);
		});

		it('should handle client cancels before freelancer starts work', async () => {
			currentUser = 'client';

			const fundedEscrowData = {
				client: clientAddress,
				freelancer: freelancerAddress,
				amount: ethers.parseEther(baseAmount),
				state: EscrowStatus.Funded,
				estimatedStartTime: BigInt(now + 86400), // 24 hours in future
				estimatedCompletionTime: BigInt(now + 90000),
				timelockEnd: BigInt(now + 150000),
				clientFeeTier: 2,
				freelancerFeeTier: 2,
				createdAt: BigInt(now)
			};

			mockContract.getEscrow.mockResolvedValue(fundedEscrowData);

			const cancelResult = await escrow.cancelEscrow(escrowId, contractEventId);

			expect(cancelResult.hash).toBeDefined();
			expect(cancelResult.status).toBe('pending');
			expect(mockContract.cancelEscrow.estimateGas).toHaveBeenCalledWith(
				escrowId,
				expect.objectContaining({
					gasPrice: expect.anything()
				})
			);

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

	describe('Dispute Two-Party Interaction', () => {
		it('should handle client disputes, freelancer proposes, client accepts', async () => {
			const now = Math.floor(Date.now() / 1000);

			const completedEscrowData = {
				client: clientAddress,
				freelancer: freelancerAddress,
				amount: ethers.parseEther(baseAmount),
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
				proposer: freelancerAddress,
				proposedAt: BigInt(now)
			};

			// Step 1: Client disputes
			currentUser = 'client';
			mockContract.getEscrow.mockResolvedValueOnce(completedEscrowData);

			const disputeResult = await escrow.disputeTask(escrowId, contractEventId);

			expect(disputeResult.hash).toBeDefined();
			expect(mockContract.disputeTask.estimateGas).toHaveBeenCalledWith(
				escrowId,
				expect.objectContaining({
					gasPrice: expect.anything()
				})
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Step 2: Freelancer proposes resolution
			currentUser = 'freelancer';
			mockContract.getEscrow.mockResolvedValueOnce(inDisputeEscrowData);

			const proposeResult = await escrow.proposeResolution(
				escrowId,
				'0.5',
				contractEventId,
				'0.5',
				'0.5'
			);

			expect(proposeResult.hash).toBeDefined();
			expect(mockContract.proposeResolution.estimateGas).toHaveBeenCalled();

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Step 3: Client accepts proposal
			currentUser = 'client';
			mockContract.getDisputeProposal.mockResolvedValueOnce(mockDisputeProposal);

			const acceptResult = await escrow.acceptProposal(escrowId, contractEventId);

			expect(acceptResult.hash).toBeDefined();
			expect(mockContract.acceptProposal.estimateGas).toHaveBeenCalled();

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingProposalAcceptance
				})
			);
		});

		it('should handle client proposes, freelancer accepts', async () => {
			const now = Math.floor(Date.now() / 1000);

			const inDisputeEscrowData = {
				client: clientAddress,
				freelancer: freelancerAddress,
				amount: ethers.parseEther(baseAmount),
				state: EscrowStatus.InDispute,
				estimatedStartTime: BigInt(now - 3600),
				estimatedCompletionTime: BigInt(now),
				timelockEnd: BigInt(now + 604800),
				clientFeeTier: 1,
				freelancerFeeTier: 1,
				createdAt: BigInt(now - 7200)
			};

			const mockDisputeProposal = {
				freelancerAmount: ethers.parseEther('0.6').toString(),
				proposer: clientAddress,
				proposedAt: BigInt(now)
			};

			// Step 1: Client proposes
			currentUser = 'client';
			mockContract.getEscrow.mockResolvedValueOnce(inDisputeEscrowData);

			const proposeResult = await escrow.proposeResolution(
				escrowId,
				'0.6',
				contractEventId,
				'0.4',
				'0.6'
			);

			expect(proposeResult.hash).toBeDefined();
			expect(mockContract.proposeResolution.estimateGas).toHaveBeenCalled();

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Step 2: Freelancer accepts
			currentUser = 'freelancer';
			mockContract.getDisputeProposal.mockResolvedValueOnce(mockDisputeProposal);

			const acceptResult = await escrow.acceptProposal(escrowId, contractEventId);

			expect(acceptResult.hash).toBeDefined();
			expect(mockContract.acceptProposal.estimateGas).toHaveBeenCalled();

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockPublishEscrowStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId,
					contractEventId,
					status: EscrowStatus.PendingProposalAcceptance
				})
			);
		});
	});

	describe('Permission Enforcement in Two-Party Context', () => {
		it('should prevent freelancer from accepting their own completion', async () => {
			currentUser = 'freelancer';

			const completedEscrowData = {
				client: clientAddress,
				freelancer: freelancerAddress,
				amount: ethers.parseEther(baseAmount),
				state: EscrowStatus.Completed,
				estimatedStartTime: BigInt(now - 3600),
				estimatedCompletionTime: BigInt(now),
				timelockEnd: BigInt(now + 604800),
				clientFeeTier: 1,
				freelancerFeeTier: 1,
				createdAt: BigInt(now - 7200)
			};

			mockContract.getEscrow.mockResolvedValue(completedEscrowData);

			// Freelancer should not be able to accept (only client can)
			// Enforced at contract call level (estimateGas/revert), surfaced by escrow.ts wrapper.
			await expect(escrow.acceptTask(escrowId, contractEventId)).rejects.toThrow(
				'Failed to accept task: Only client can accept task'
			);
			expect(mockContract.acceptTask).not.toHaveBeenCalled();
		});

		it('should prevent client from completing task', async () => {
			currentUser = 'client';

			const fundedEscrowData = {
				client: clientAddress,
				freelancer: freelancerAddress,
				amount: ethers.parseEther(baseAmount),
				state: EscrowStatus.Funded,
				estimatedStartTime: BigInt(now - 3600), // Past start time
				estimatedCompletionTime: BigInt(now + 3600),
				timelockEnd: BigInt(now + 604800),
				clientFeeTier: 1,
				freelancerFeeTier: 1,
				createdAt: BigInt(now - 7200)
			};

			mockContract.getEscrow.mockResolvedValue(fundedEscrowData);

			// Client should not be able to complete (only freelancer can)
			await expect(escrow.completeTask(escrowId, contractEventId)).rejects.toThrow(
				'Failed to complete task: Only freelancer can complete task'
			);
			expect(mockContract.completeTask).not.toHaveBeenCalled();
		});
	});
});
