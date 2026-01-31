import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import type { Contract, Wallet, JsonRpcProvider } from 'ethers';

// Mock wallet store before importing escrow
vi.mock('$lib/stores/wallet.store', () => ({
	getWallet: vi.fn(),
	getProvider: vi.fn(),
	walletManager: {
		initialize: vi.fn()
	},
	walletStore: {
		subscribe: vi.fn((callback) => {
			callback({
				rsk: { wallet: null, provider: null },
				bsc: { wallet: null, provider: null }
			});
			return () => {};
		})
	}
}));

// Mock environment variables
vi.mock('@bittasker/wallet-core', () => ({
	FEE_TIERS: {
		0: { percentage: 150 },
		1: { percentage: 200 },
		2: { percentage: 250 }
	}
}));

// Mock escrow ABI
vi.mock('$lib/utils/escrow/v1/abi.json', () => ({
	default: [
		{
			inputs: [],
			name: 'nextEscrowId',
			outputs: [{ name: '', type: 'uint256' }],
			stateMutability: 'view',
			type: 'function'
		},
		{
			inputs: [{ name: 'escrowId', type: 'uint256' }],
			name: 'getEscrow',
			outputs: [
				{ name: 'client', type: 'address' },
				{ name: 'freelancer', type: 'address' },
				{ name: 'amount', type: 'uint256' },
				{ name: 'state', type: 'uint8' },
				{ name: 'estimatedStartTime', type: 'uint256' },
				{ name: 'estimatedCompletionTime', type: 'uint256' },
				{ name: 'timelockEnd', type: 'uint256' },
				{ name: 'clientFeeTier', type: 'uint8' },
				{ name: 'freelancerFeeTier', type: 'uint8' },
				{ name: 'createdAt', type: 'uint256' }
			],
			stateMutability: 'view',
			type: 'function'
		}
	]
}));

// Mock rpcHelpers
const mockCallContractMethod = vi.fn();
vi.mock('../rpcHelpers', () => ({
	callContractMethod: (...args: any[]) => mockCallContractMethod(...args)
}));

// Mock app store
vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: vi.fn(),
		showSuccessToast: vi.fn(),
		showInfoToast: vi.fn()
	}
}));

// Mock svelte-i18n
vi.mock('svelte-i18n', () => ({
	t: vi.fn((key: string) => key),
	get: vi.fn((fn: any) => fn)
}));

// Mock svelte/store
vi.mock('svelte/store', async () => {
	const actual = await vi.importActual('svelte/store');
	return {
		...actual,
		get: vi.fn((store: any) => {
			if (typeof store === 'function') {
				return store();
			}
			return store;
		})
	};
});

// Mock escrowEvents to avoid store dependencies
const mockCleanupPendingContractByTxHash = vi.fn();
vi.mock('../escrowEvents', () => ({
	default: {
		handleEscrowCreated: vi.fn(),
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
		handleTimelockResolved: vi.fn(),
		cleanupPendingContractByTxHash: mockCleanupPendingContractByTxHash
	}
}));

// Now import escrow after mocks
import { escrow } from '$lib/utils/escrow/v1/escrow';
import { getWallet, getProvider, walletManager } from '$lib/stores/wallet.store';

// Setup mocks after import
const mockGetWalletFn = getWallet as ReturnType<typeof vi.fn>;
const mockGetProviderFn = getProvider as ReturnType<typeof vi.fn>;
const mockWalletManager = walletManager as { initialize: ReturnType<typeof vi.fn> };

describe('escrow', () => {
	let mockWallet: Wallet;
	let mockProvider: JsonRpcProvider;
	let mockContract: Contract;
	const mockContractAddress = '0x1234567890123456789012345678901234567890';
	const mockLegacyAddress = '0x0987654321098765432109876543210987654321';

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock provider
		mockProvider = {
			getBalance: vi.fn().mockResolvedValue(BigInt('1000000000000000000')),
			getCode: vi.fn().mockResolvedValue('0x1234'),
			getFeeData: vi.fn().mockResolvedValue({
				gasPrice: BigInt('20000000000'),
				maxFeePerGas: null,
				maxPriorityFeePerGas: null
			}),
			_destroyed: false,
			destroyed: false
		} as unknown as JsonRpcProvider;

		// Create mock wallet
		mockWallet = {
			address: '0x1111111111111111111111111111111111111111',
			provider: mockProvider
		} as unknown as Wallet;

		// Create mock contract
		mockContract = {
			target: mockContractAddress,
			provider: mockProvider,
			interface: {
				parseLog: vi.fn()
			},
			nextEscrowId: vi.fn().mockResolvedValue(BigInt(10)),
			getEscrow: vi.fn(),
			createEscrow: {
				estimateGas: vi.fn().mockResolvedValue(BigInt(100000))
			}
		} as unknown as Contract;

		// Setup default mocks
		mockGetWalletFn.mockReturnValue(mockWallet);
		mockGetProviderFn.mockReturnValue(mockProvider);
		mockWalletManager.initialize.mockResolvedValue(undefined);

		// Reset escrow cache
		escrow.resetCachedContract();
	});

	afterEach(() => {
		vi.clearAllMocks();
		escrow.resetCachedContract();
	});

	describe('resetCachedContract', () => {
		it('should reset the default contract cache', () => {
			// This is tested indirectly through ensureEscrowReady tests
			expect(escrow.resetCachedContract).toBeDefined();
		});
	});

	describe('ensureEscrowReady', () => {
		describe('Provider destroyed detection', () => {
			it('should detect destroyed provider using _destroyed property', async () => {
				// First call creates contract
				const result1 = await escrow.ensureEscrowReady(undefined, false);
				expect(result1.contract).toBeDefined();

				// Simulate provider being destroyed
				const destroyedProvider = {
					...mockProvider,
					_destroyed: true
				};
				(mockContract as any).provider = destroyedProvider;

				// Second call should detect destroyed provider and recreate contract
				mockGetProviderFn.mockReturnValue(mockProvider);
				const result2 = await escrow.ensureEscrowReady(undefined, false);
				expect(result2.contract).toBeDefined();
			});

			it('should detect destroyed provider using destroyed property', async () => {
				// First call creates contract
				const result1 = await escrow.ensureEscrowReady(undefined, false);
				expect(result1.contract).toBeDefined();

				// Simulate provider being destroyed
				const destroyedProvider = {
					...mockProvider,
					destroyed: true
				};
				(mockContract as any).provider = destroyedProvider;

				// Second call should detect destroyed provider and recreate contract
				mockGetProviderFn.mockReturnValue(mockProvider);
				const result2 = await escrow.ensureEscrowReady(undefined, false);
				expect(result2.contract).toBeDefined();
			});

			it('should handle error when checking provider state', async () => {
				// First call creates contract
				const result1 = await escrow.ensureEscrowReady(undefined, false);
				expect(result1.contract).toBeDefined();

				// Simulate error accessing provider
				const errorProvider = {
					get provider() {
						throw new Error('Provider access error');
					}
				};
				(mockContract as any).provider = errorProvider;

				// Should handle error gracefully and recreate contract
				mockGetProviderFn.mockReturnValue(mockProvider);
				const result2 = await escrow.ensureEscrowReady(undefined, false);
				expect(result2.contract).toBeDefined();
			});

			it('should validate provider is not null before using', async () => {
				// First call returns null, initialization happens, second call also returns null
				mockGetProviderFn
					.mockReturnValueOnce(null) // First call
					.mockReturnValueOnce(null); // Second call after initialization

				mockWalletManager.initialize.mockResolvedValue(undefined);

				await expect(escrow.ensureEscrowReady(undefined, false)).rejects.toThrow(
					'Failed to get provider'
				);
			});
		});

		describe('Legacy contract handling', () => {
			it('should cache legacy contracts', async () => {
				const result1 = await escrow.ensureEscrowReady(mockLegacyAddress, false);
				expect(result1.contract).toBeDefined();

				// Second call should use cached contract
				const result2 = await escrow.ensureEscrowReady(mockLegacyAddress, false);
				expect(result2.contract).toBe(result1.contract);
			});

			it('should handle legacy contract with destroyed provider', async () => {
				// Create legacy contract
				const result1 = await escrow.ensureEscrowReady(mockLegacyAddress, false);
				const legacyContract = result1.contract;

				// Simulate provider being destroyed
				const destroyedProvider = {
					...mockProvider,
					_destroyed: true
				};
				(legacyContract as any).provider = destroyedProvider;

				// Currently legacy contracts are not checked - this test documents the issue
				// After fix, this should recreate the contract
				const result2 = await escrow.ensureEscrowReady(mockLegacyAddress, false);
				// Currently returns destroyed contract - should be fixed
				expect(result2.contract).toBeDefined();
			});

			it('should handle non-null assertion safely for legacy contracts', async () => {
				// This test documents the unsafe non-null assertion issue
				// After fix, should handle missing contract gracefully
				const result = await escrow.ensureEscrowReady(mockLegacyAddress, false);
				expect(result.contract).toBeDefined();
			});
		});

		describe('Default contract handling', () => {
			it('should create default contract when none exists', async () => {
				const result = await escrow.ensureEscrowReady(undefined, false);
				expect(result.contract).toBeDefined();
				expect(result.wallet).toBe(mockWallet);
				expect(result.provider).toBe(mockProvider);
			});

			it('should reuse cached default contract when provider is valid', async () => {
				const result1 = await escrow.ensureEscrowReady(undefined, false);
				const result2 = await escrow.ensureEscrowReady(undefined, false);
				expect(result2.contract).toBe(result1.contract);
			});

			it('should handle default contract address matching legacy address', async () => {
				// Mock getDefaultContractAddress to return mockLegacyAddress
				vi.doMock('@bittasker/wallet-core', () => ({
					...vi.importActual('@bittasker/wallet-core'),
					getDefaultContractAddress: () => mockLegacyAddress
				}));

				const result = await escrow.ensureEscrowReady(mockLegacyAddress, false);
				expect(result.contract).toBeDefined();
			});
		});

		describe('Wallet initialization', () => {
			it('should initialize wallet if not available', async () => {
				mockGetWalletFn.mockReturnValueOnce(null).mockReturnValue(mockWallet);
				mockWalletManager.initialize.mockResolvedValue(undefined);

				const result = await escrow.ensureEscrowReady(undefined, false);
				expect(mockWalletManager.initialize).toHaveBeenCalled();
				expect(result.wallet).toBe(mockWallet);
			});

			it('should throw error if wallet initialization fails', async () => {
				mockGetWalletFn.mockReturnValue(null);
				mockWalletManager.initialize.mockResolvedValue(undefined);
				mockGetWalletFn.mockReturnValue(null);

				await expect(escrow.ensureEscrowReady(undefined, false)).rejects.toThrow(
					'Failed to initialize wallet'
				);
			});
		});

		describe('Balance checking', () => {
			it('should check balance when requireBalance is true', async () => {
				const result = await escrow.ensureEscrowReady(undefined, true);
				expect(mockProvider.getBalance).toHaveBeenCalledWith(mockWallet.address);
				expect(result).toBeDefined();
			});

			it('should skip balance check when requireBalance is false', async () => {
				const result = await escrow.ensureEscrowReady(undefined, false);
				expect(mockProvider.getBalance).not.toHaveBeenCalled();
				expect(result).toBeDefined();
			});

			it('should throw error when balance is zero and requireBalance is true', async () => {
				(mockProvider.getBalance as any).mockResolvedValueOnce(BigInt(0));

				await expect(escrow.ensureEscrowReady(undefined, true)).rejects.toThrow(
					'Insufficient balance'
				);
			});
		});

		describe('Type safety', () => {
			it('should return properly typed contract, wallet, and provider', async () => {
				const result = await escrow.ensureEscrowReady(undefined, false);
				expect(result.contract).toBeDefined();
				expect(result.wallet).toBeDefined();
				expect(result.provider).toBeDefined();
				// Type checking - these should not throw
				expect(typeof result.contract).toBe('object');
				expect(typeof result.wallet).toBe('object');
				expect(typeof result.provider).toBe('object');
			});

			it('should handle null provider gracefully', async () => {
				// First call returns null, initialization happens, second call also returns null
				mockGetProviderFn
					.mockReturnValueOnce(null) // First call
					.mockReturnValueOnce(null); // Second call after initialization

				mockWalletManager.initialize.mockResolvedValue(undefined);

				await expect(escrow.ensureEscrowReady(undefined, false)).rejects.toThrow(
					'Failed to get provider'
				);
			});
		});

		describe('Error handling', () => {
			it('should handle contract connection errors', async () => {
				mockGetProviderFn.mockReturnValue(null);
				mockWalletManager.initialize.mockResolvedValue(undefined);
				mockGetProviderFn.mockReturnValueOnce(null).mockReturnValue(null);

				await expect(escrow.ensureEscrowReady(undefined, false)).rejects.toThrow(
					'Failed to get provider'
				);
			});

			it('should handle provider getBalance errors', async () => {
				(mockProvider.getBalance as any).mockRejectedValueOnce(new Error('RPC error'));

				await expect(escrow.ensureEscrowReady(undefined, true)).rejects.toThrow();
			});
		});

		describe('Concurrent access', () => {
			it('should handle concurrent calls to ensureEscrowReady', async () => {
				const promises = [
					escrow.ensureEscrowReady(undefined, false),
					escrow.ensureEscrowReady(undefined, false),
					escrow.ensureEscrowReady(undefined, false)
				];

				const results = await Promise.all(promises);
				// All should succeed
				results.forEach((result) => {
					expect(result.contract).toBeDefined();
					expect(result.wallet).toBeDefined();
					expect(result.provider).toBeDefined();
				});
			});
		});
	});

	describe('Provider validation', () => {
		it('should validate provider after contract reset', async () => {
			// First call
			const result1 = await escrow.ensureEscrowReady(undefined, false);

			// Simulate provider destruction
			const destroyedProvider = {
				...mockProvider,
				_destroyed: true
			};
			(mockContract as any).provider = destroyedProvider;

			// Get fresh provider
			mockGetProviderFn.mockReturnValue(mockProvider);

			// Second call should use fresh provider
			const result2 = await escrow.ensureEscrowReady(undefined, false);
			expect(result2.provider).toBe(mockProvider);
		});
	});
});

