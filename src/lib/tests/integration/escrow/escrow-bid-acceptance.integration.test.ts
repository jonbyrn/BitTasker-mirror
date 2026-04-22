import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import type { NostrBidContent, NostrEventWithFollowup } from '$lib/types/bid';
import type { Task } from '$lib/types/task';
import type { NostrEvent } from 'nostr-tools';

// Mock dependencies
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr.toLowerCase())
}));

// Mock ethers (tests use mocked escrow.createEscrow; Contract may still be constructed as null)
const mockContractInstance = null;
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
		address: '0x1111111111111111111111111111111111111111'
	})),
	getProvider: vi.fn(() => ({
		getFeeData: vi.fn().mockResolvedValue({
			gasPrice: BigInt('1000000000')
		})
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

// Mock escrow
const mockCreateEscrow = vi.hoisted(() => vi.fn());
vi.mock('$lib/utils/escrow/v1/escrow', () => ({
	escrow: {
		ensureEscrowReady: vi.fn(),
		createEscrow: mockCreateEscrow
	}
}));

// Mock escrowEvents
const { mockPublishEscrowStatus, mockRegisterPendingContractByTxHash, mockCleanupPendingContractByTxHash } = vi.hoisted(() => ({
	mockPublishEscrowStatus: vi.fn(),
	mockRegisterPendingContractByTxHash: vi.fn(),
	mockCleanupPendingContractByTxHash: vi.fn()
}));
vi.mock('$lib/utils/escrow/v1/escrowEvents', () => ({
	publishEscrowStatus: mockPublishEscrowStatus,
	registerPendingContractByTxHash: mockRegisterPendingContractByTxHash,
	cleanupPendingContractByTxHash: mockCleanupPendingContractByTxHash,
	contractCreationStore: { subscribe: vi.fn() }
}));

// Mock contract error handler
vi.mock('$lib/utils/wallet/contractErrorHandler', () => ({
	extractContractError: vi.fn((error) => ({
		userMessage: error instanceof Error ? error.message : 'Unknown error',
		code: 'UNKNOWN_ERROR'
	}))
}));

// Import after mocks
import { acceptBidAndCreateEscrow } from '$lib/utils/escrow/v1/escrowBid';

describe('Escrow Bid Acceptance Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWalletStore.rsk.connected = true;
		mockWalletStore.rsk.contractConnected = true;
	});

	describe('Successful Bid Acceptance', () => {
		it('should accept bid and create escrow with valid data', async () => {
			const now = Math.floor(Date.now() / 1000);
			const btcPrice = 65000;

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

			mockCreateEscrow.mockResolvedValue({
				hash: '0x123',
				escrowId: '123',
				status: 'pending'
			});

			const result = await acceptBidAndCreateEscrow(mockBid, mockTask, btcPrice, 'RSK');

			expect(result.success).toBe(true);
			expect(result.transactionResult).toBeDefined();
			expect(mockCreateEscrow).toHaveBeenCalled();
			expect(mockRegisterPendingContractByTxHash).toHaveBeenCalled();
		});

		it('should adjust start time if in the past', async () => {
			const now = Math.floor(Date.now() / 1000);
			const pastStartTime = now - 3600; // 1 hour ago

			const mockBid: NostrEventWithFollowup = {
				id: 'bid-456',
				content: {
					bidderId: 'npub1freelancer',
					amount: 50,
					currency: 'USD',
					estimatedHours: 1
				} as unknown as NostrBidContent,
				pubkey: 'npub1freelancer',
				created_at: pastStartTime,
				kind: 1,
				sig: 'sig',
				tags: []
			};

			const mockTask: NostrEvent = {
				id: 'task-456',
				content: JSON.stringify({
					title: 'Past Task',
					description: 'Task with past start time',
					budget: { amount: 50, currency: 'USD', type: 'fixed' }
				} as Task),
				pubkey: 'npub1client',
				created_at: pastStartTime - 3600,
				kind: 1,
				sig: 'sig',
				tags: []
			};

			mockCreateEscrow.mockResolvedValue({
				hash: '0x456',
				escrowId: '456',
				status: 'pending'
			});

			const result = await acceptBidAndCreateEscrow(mockBid, mockTask, 65000, 'RSK');

			expect(result.success).toBe(true);
			// Verify that createEscrow was called with adjusted times
			expect(mockCreateEscrow).toHaveBeenCalled();
			const callArgs = mockCreateEscrow.mock.calls[0];
			const adjustedStartTime = callArgs[2];
			expect(adjustedStartTime).toBeGreaterThan(now); // Should be in future
		});
	});

	describe('Bid Acceptance Validation', () => {
		it('should reject bid with zero amount', async () => {
			const mockBid: NostrEventWithFollowup = {
				id: 'bid-invalid',
				content: {
					bidderId: 'npub1freelancer',
					amount: 0, // Invalid
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

			const result = await acceptBidAndCreateEscrow(mockBid, mockTask, 65000, 'RSK');

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.error).toContain('Validation failed');
		});

		it('should reject bid when wallet not connected', async () => {
			mockWalletStore.rsk.connected = false;

			const mockBid: NostrEventWithFollowup = {
				id: 'bid-no-wallet',
				content: {
					bidderId: 'npub1freelancer',
					amount: 100,
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
				id: 'task-no-wallet',
				content: JSON.stringify({
					title: 'Test Task',
					description: 'Test Description',
					budget: { amount: 100, currency: 'USD', type: 'fixed' }
				} as Task),
				pubkey: 'npub1client',
				created_at: Math.floor(Date.now() / 1000),
				kind: 1,
				sig: 'sig',
				tags: []
			};

			const result = await acceptBidAndCreateEscrow(mockBid, mockTask, 65000, 'RSK');

			expect(result.success).toBe(false);
			expect(result.error).toContain('wallet not connected');
		});

		it('should handle insufficient balance error', async () => {
			mockCreateEscrow.mockRejectedValueOnce(new Error('Insufficient funds'));

			const mockBid: NostrEventWithFollowup = {
				id: 'bid-insufficient',
				content: {
					bidderId: 'npub1freelancer',
					amount: 1000000, // Very large amount
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
				id: 'task-insufficient',
				content: JSON.stringify({
					title: 'Expensive Task',
					description: 'Very expensive task',
					budget: { amount: 1000000, currency: 'USD', type: 'fixed' }
				} as Task),
				pubkey: 'npub1client',
				created_at: Math.floor(Date.now() / 1000),
				kind: 1,
				sig: 'sig',
				tags: []
			};

			const result = await acceptBidAndCreateEscrow(mockBid, mockTask, 65000, 'RSK');

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});

	describe('Fee Tier Calculations in Bid Acceptance', () => {
		it('should calculate fees correctly for tier 1 (2.5%)', async () => {
			const mockBid: NostrEventWithFollowup = {
				id: 'bid-tier1',
				content: {
					bidderId: 'npub1freelancer',
					amount: 100,
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
				id: 'task-tier1',
				content: JSON.stringify({
					title: 'Test Task',
					description: 'Test Description',
					budget: { amount: 100, currency: 'USD', type: 'fixed' }
				} as Task),
				pubkey: 'npub1client',
				created_at: Math.floor(Date.now() / 1000),
				kind: 1,
				sig: 'sig',
				tags: []
			};

			mockCreateEscrow.mockResolvedValue({
				hash: '0xtier1',
				escrowId: 'tier1',
				status: 'pending'
			});

			const result = await acceptBidAndCreateEscrow(mockBid, mockTask, 65000, 'RSK');

			expect(result.success).toBe(true);
			// Verify fee tier was used (tier 1 = 2.5%)
			expect(mockCreateEscrow).toHaveBeenCalled();
			const callArgs = mockCreateEscrow.mock.calls[0];
			expect(callArgs[4]).toBe(1); // clientFeeTier
			expect(callArgs[5]).toBe(1); // freelancerFeeTier
		});
	});
});
