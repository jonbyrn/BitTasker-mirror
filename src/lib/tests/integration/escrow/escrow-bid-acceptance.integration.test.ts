import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import type { NostrBidContent, NostrEventWithFollowup } from '$lib/types/bid';
import type { NostrEvent } from 'nostr-tools';

const { mockCreateEscrow, mockRegisterPendingContractByTxHash, mockContractState } = vi.hoisted(
	() => ({
		mockCreateEscrow: vi.fn(),
		mockRegisterPendingContractByTxHash: vi.fn(),
		mockContractState: {
			instance: null as unknown
		}
	})
);

// Mock dependencies
vi.mock('@bittasker/wallet-core', () => ({
	FEE_TIERS: {
		1: { percentage: 250, label: '2.5%' },
		2: { percentage: 200, label: '2.0%' },
		3: { percentage: 150, label: '1.5%' }
	},
	normalizeRskAddress: vi.fn((addr: string) => addr.toLowerCase())
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

// Mock escrow
vi.mock('$lib/utils/escrow/v1/escrow', () => ({
	escrow: {
		ensureEscrowReady: vi.fn(),
		createEscrow: mockCreateEscrow
	}
}));

// Mock escrowEvents
vi.mock('$lib/utils/escrow/v1/escrowEvents', () => ({
	registerPendingContractByTxHash: mockRegisterPendingContractByTxHash
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

function asNostrEventWithFollowup(event: {
	id: string;
	content: Record<string, unknown>;
	pubkey: string;
	created_at: number;
	kind: number;
	sig: string;
	tags: string[][];
}): NostrEventWithFollowup {
	return event as unknown as NostrEventWithFollowup;
}

function buildBidContent(
	overrides: Partial<NostrBidContent> = {},
	now = Math.floor(Date.now() / 1000)
): Record<string, unknown> {
	return {
		type: 'bid',
		taskId: 'task-123',
		taskTitle: 'Test Task',
		taskDescription: 'Test Description',
		description: 'Bid description',
		estimatedDuration: '2h',
		proposedApproach: 'Test approach',
		coverLetter: 'Test cover letter',
		timestamp: now,
		bidId: `bid-${now}`,
		bidderId: 'npub1freelancer',
		bidderWalletAddress: '0x2222222222222222222222222222222222222222',
		bidderName: 'Freelancer',
		bidderRating: 4.5,
		amount: 100,
		currency: 'USD',
		paymentType: 'FIXED',
		estimatedHours: 2,
		startDateTime: new Date((now + 3600) * 1000).toISOString(),
		endDateTime: new Date((now + 7200) * 1000).toISOString(),
		...overrides
	};
}

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

			const mockBid = asNostrEventWithFollowup({
				id: 'bid-123',
				content: buildBidContent({}, now),
				pubkey: 'npub1freelancer',
				created_at: now,
				kind: 1,
				sig: 'sig',
				tags: []
			});

			const mockTask: NostrEvent = {
				id: 'task-123',
				content: JSON.stringify({
					title: 'Test Task',
					description: 'Test Description',
					budget: { amount: 100, currency: 'USD', type: 'fixed' }
				}),
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

			const mockBid = asNostrEventWithFollowup({
				id: 'bid-456',
				content: buildBidContent(
					{
						amount: 50,
						estimatedHours: 1,
						startDateTime: new Date((pastStartTime - 3600) * 1000).toISOString(),
						endDateTime: new Date((pastStartTime + 1800) * 1000).toISOString()
					},
					pastStartTime
				),
				pubkey: 'npub1freelancer',
				created_at: pastStartTime,
				kind: 1,
				sig: 'sig',
				tags: []
			});

			const mockTask: NostrEvent = {
				id: 'task-456',
				content: JSON.stringify({
					title: 'Past Task',
					description: 'Task with past start time',
					budget: { amount: 50, currency: 'USD', type: 'fixed' }
				}),
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
			const mockBid = asNostrEventWithFollowup({
				id: 'bid-invalid',
				content: buildBidContent({ amount: 0 }),
				pubkey: 'npub1freelancer',
				created_at: Math.floor(Date.now() / 1000),
				kind: 1,
				sig: 'sig',
				tags: []
			});

			const mockTask: NostrEvent = {
				id: 'task-invalid',
				content: JSON.stringify({
					title: 'Test Task',
					description: 'Test Description',
					budget: { amount: 0, currency: 'USD', type: 'fixed' } // Invalid
				}),
				pubkey: 'npub1client',
				created_at: Math.floor(Date.now() / 1000),
				kind: 1,
				sig: 'sig',
				tags: []
			};

			const result = await acceptBidAndCreateEscrow(mockBid, mockTask, 65000, 'RSK');

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.error).toContain('Invalid bid amount');
		});

		it('should reject bid when wallet not connected', async () => {
			mockWalletStore.rsk.connected = false;

			const mockBid = asNostrEventWithFollowup({
				id: 'bid-no-wallet',
				content: buildBidContent(),
				pubkey: 'npub1freelancer',
				created_at: Math.floor(Date.now() / 1000),
				kind: 1,
				sig: 'sig',
				tags: []
			});

			const mockTask: NostrEvent = {
				id: 'task-no-wallet',
				content: JSON.stringify({
					title: 'Test Task',
					description: 'Test Description',
					budget: { amount: 100, currency: 'USD', type: 'fixed' }
				}),
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

			const mockBid = asNostrEventWithFollowup({
				id: 'bid-insufficient',
				content: buildBidContent({ amount: 1000000 }),
				pubkey: 'npub1freelancer',
				created_at: Math.floor(Date.now() / 1000),
				kind: 1,
				sig: 'sig',
				tags: []
			});

			const mockTask: NostrEvent = {
				id: 'task-insufficient',
				content: JSON.stringify({
					title: 'Expensive Task',
					description: 'Very expensive task',
					budget: { amount: 1000000, currency: 'USD', type: 'fixed' }
				}),
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
			const mockBid = asNostrEventWithFollowup({
				id: 'bid-tier1',
				content: buildBidContent({ amount: 100 }),
				pubkey: 'npub1freelancer',
				created_at: Math.floor(Date.now() / 1000),
				kind: 1,
				sig: 'sig',
				tags: []
			});

			const mockTask: NostrEvent = {
				id: 'task-tier1',
				content: JSON.stringify({
					title: 'Test Task',
					description: 'Test Description',
					budget: { amount: 100, currency: 'USD', type: 'fixed' }
				}),
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
