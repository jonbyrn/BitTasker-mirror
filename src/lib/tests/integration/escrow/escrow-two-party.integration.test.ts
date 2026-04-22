import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
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

// Mock dependencies
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr.toLowerCase()),
	FEE_TIERS: {
		1: { percentage: 250, label: '2.5%' },
		2: { percentage: 200, label: '2.0%' },
		3: { percentage: 150, label: '1.5%' }
	}
}));

// Mock ethers
let mockContractInstance: EscrowV1IntegrationMockContract | null = null;
vi.mock('ethers', async () => {
	const actual = await vi.importActual('ethers');
	return {
		...actual,
		ethers: {
			...actual.ethers,
			Contract: vi.fn().mockImplementation(() => mockContractInstance)
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
		{ subscribe: vi.fn() }
	);
	return { t: mockT };
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
		derived: vi.fn(() => ({ subscribe: vi.fn() }))
	};
});

// Import after mocks
import { escrow } from '$lib/utils/escrow/v1/escrow';

const NOSTR_PEER_HEX = 'aa'.repeat(32);

describe('Escrow Two-Party Interaction Integration Tests', () => {
	let mockContract: EscrowV1IntegrationMockContract;
	const escrowId = 'two-party-123';
	const contractEventId = 'contract-two-party-123';
	const clientAddress = '0x1111111111111111111111111111111111111111';
	const freelancerAddress = '0x2222222222222222222222222222222222222222';
	const baseAmount = '1.0';
	const now = Math.floor(Date.now() / 1000);
	const startTime = now + 3600;
	const completionTime = now + 7200;

	beforeEach(() => {
		vi.clearAllMocks();
		currentUser = 'client'; // Start as client

		const createMockWait = (receipt: EscrowMockTxReceipt) => {
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
			hash: '0xcreate',
			gasUsed: BigInt(100000),
			logs: []
		});

		mockContract.completeTask = createMethodWithEstimateGas(BigInt(50000), {
			hash: '0xcomplete',
			gasUsed: BigInt(50000),
			logs: []
		});

		mockContract.acceptTask = createMethodWithEstimateGas(BigInt(40000), {
			hash: '0xaccept',
			gasUsed: BigInt(40000),
			logs: []
		});

		mockContractInstance = mockContract;
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

			// Simulate blockchain confirmation
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Simulate EscrowCreated event handling
			await EscrowNostrEvent.default.handleEscrowCreated({
				escrowId,
				transactionHash: createResult.hash,
				client: clientAddress,
				freelancer: freelancerAddress,
				amount: ethers.parseEther(baseAmount).toString()
			});

			expect(mockHandleEscrowCreated).toHaveBeenCalled();
			expect(mockCreateContract).toHaveBeenCalled();

			// Step 2: Freelancer completes task
			currentUser = 'freelancer';
			mockContract.getEscrow.mockResolvedValueOnce(completedEscrowData);

			const completeResult = await escrow.completeTask(escrowId, NOSTR_PEER_HEX, contractEventId);

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

			const acceptResult = await escrow.acceptTask(escrowId, NOSTR_PEER_HEX, contractEventId);

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

			const disputeResult = await escrow.disputeTask(escrowId, NOSTR_PEER_HEX, contractEventId);

			expect(disputeResult.hash).toBeDefined();

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Step 2: Freelancer proposes resolution
			currentUser = 'freelancer';
			mockContract.getEscrow.mockResolvedValueOnce(inDisputeEscrowData);

			const proposeResult = await escrow.proposeResolution(
				escrowId,
				NOSTR_PEER_HEX,
				'0.5',
				contractEventId,
				'0.5',
				'0.5'
			);

			expect(proposeResult.hash).toBeDefined();

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Step 3: Client accepts proposal
			currentUser = 'client';
			mockContract.getDisputeProposal.mockResolvedValueOnce(mockDisputeProposal);

			const acceptResult = await escrow.acceptProposal(escrowId, NOSTR_PEER_HEX, contractEventId);

			expect(acceptResult.hash).toBeDefined();

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
				NOSTR_PEER_HEX,
				'0.6',
				contractEventId,
				'0.4',
				'0.6'
			);

			expect(proposeResult.hash).toBeDefined();

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Step 2: Freelancer accepts
			currentUser = 'freelancer';
			mockContract.getDisputeProposal.mockResolvedValueOnce(mockDisputeProposal);

			const acceptResult = await escrow.acceptProposal(escrowId, NOSTR_PEER_HEX, contractEventId);

			expect(acceptResult.hash).toBeDefined();

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
			// This would be enforced by the smart contract, but we test the integration
			await expect(escrow.acceptTask(escrowId, NOSTR_PEER_HEX, contractEventId)).rejects.toThrow();
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
			await expect(
				escrow.completeTask(escrowId, NOSTR_PEER_HEX, contractEventId)
			).rejects.toThrow();
		});
	});
});
