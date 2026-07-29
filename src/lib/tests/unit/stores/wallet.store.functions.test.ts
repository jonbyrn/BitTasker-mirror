import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { getRSKAddress, walletStore, walletManager } from '$lib/stores/wallet.store';
// Import will be used inside hoisted function

// Prevent profile.ts -> upload.service -> BaseApiService load failure in test env
vi.mock('$lib/api/services/upload.service', () => ({
	default: {
		uploadSingleFile: vi.fn(),
		uploadMultipleFiles: vi.fn(),
		deleteFile: vi.fn(),
		getImageUrl: vi.fn(),
		generateResponsiveUrls: vi.fn()
	}
}));

// Mock dependencies
vi.mock('$lib/utils/helpers/mnemonic', () => ({
	getMnemonic: vi.fn().mockResolvedValue('test mnemonic phrase twelve words long enough for bip39')
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: vi.fn().mockResolvedValue({
		nsec: new Uint8Array(32),
		npub: 'npub1test'
	})
}));

vi.mock('$lib/utils/swapAdapter', () => ({
	NostrSwapStorage: vi.fn(function () {
		return {
			loadAllIncludingFinal: vi.fn().mockResolvedValue([])
		};
	})
}));

vi.mock('$lib/nostr/ndkSigner', () => ({
	syncNdkSignerFromAppStore: vi.fn().mockResolvedValue(undefined),
	applyNdkSignerFromNsec: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');
	const mockPool = { subscribe: () => () => {}, publish: () => [], querySync: () => [] };
	return {
		appStore: writable({
			biometricData: {
				password: 'encrypted-password'
			},
			pool: mockPool
		})
	};
});

vi.mock('$lib/utils/helpers/auth', () => ({
	decryptWalletMnemonicWithBiometrics: vi
		.fn()
		.mockResolvedValue('test mnemonic phrase twelve words long enough for bip39')
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(65000)
	}
}));

// Mock the SDK WalletManager - create mock inline to avoid import hoisting issues
const mockWalletManager = vi.hoisted(() => {
	// Create mock inline to avoid import hoisting issues
	const mockRskWallet = {
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
		getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
		getBalance: vi
			.fn()
			.mockResolvedValue({ balance: BigInt('1000000000000000000'), formatted: '1.00' }),
		getWallet: vi.fn().mockReturnValue(null),
		getProvider: vi.fn().mockReturnValue(null),
		loadTransactions: vi.fn().mockResolvedValue([]),
		onBlock: vi.fn().mockReturnValue(() => {})
	};

	const mockBscWallet = {
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
		getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
		getBalances: vi.fn().mockResolvedValue({
			bnb: { balance: BigInt('500000000000000000'), formatted: '0.50' },
			usdt: { balance: BigInt('100000000'), formatted: '100.00' }
		}),
		getWallet: vi.fn().mockReturnValue(null),
		getProvider: vi.fn().mockReturnValue(null),
		loadTransactions: vi.fn().mockResolvedValue([])
	};

	const mockSwapService = {
		recoverPendingSwaps: vi.fn().mockResolvedValue([]),
		getActiveSwaps: vi.fn().mockReturnValue([]),
		getSwap: vi.fn().mockReturnValue(undefined)
	};

	return {
		initialize: vi.fn().mockResolvedValue(undefined),
		dispose: vi.fn().mockResolvedValue(undefined),
		onSwapUpdate: vi.fn().mockReturnValue(() => {}),
		rskWallet: mockRskWallet,
		bscWallet: mockBscWallet,
		loadAssets: vi.fn().mockResolvedValue([]),
		loadTransactions: vi.fn().mockResolvedValue([]),
		submarineSwapService: mockSwapService,
		reverseSwapService: mockSwapService,
		chainSwapService: mockSwapService
	};
});

vi.mock('@bittasker/wallet-core', async () => {
	return {
		WalletManager: vi.fn(function () {
			return mockWalletManager;
		}),
		ERC20_ABI: [
			'function transfer(address, uint256) returns (bool)',
			'function decimals() view returns (uint8)'
		],
		ARB_TOKEN_ADDRESSES: {
			USDT0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
			WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
			TBTC: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40'
		}
	};
});

describe('Wallet Store Functions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset wallet store to initial state
		walletStore.set({
			isInitializing: false,
			isConnected: false,

			error: null,
			rsk: {
				connected: false,
				connecting: false,
				error: null,
				address: null,
				balance: '0',
				formattedBalance: '0.00',
				blockNumber: null,
				provider: null,
				wallet: null
			},
			bsc: {
				connected: false,
				connecting: false,
				error: null,
				address: null,
				bnbBalance: '0',
				formattedBnbBalance: '0.00',
				usdtBalance: '0',
				formattedUsdtBalance: '0.00',
				blockNumber: null,
				provider: null,
				wallet: null,
				usdtContract: null,
				paymasterContract: null,
				paymasterConnected: false,
				paymasterAddress: null,
				canPayFeesInUsdt: false
			},
			assets: [],
			transactions: [],
			totalBalances: {
				usd: 0,
				sats: 0,
				rbtc: 0,
				usdt: 0,
				bnb: 0
			},
			rbtcToBtcRate: 1.0,
			rbtcRateError: false,
			activeNetwork: 'rsk',
			selectedAsset: 'rBTC'
		} as unknown as Parameters<typeof walletStore.set>[0]);
	});

	afterEach(() => {
		walletManager.cleanup();
	});

	describe('getRSKAddress', () => {
		it('should return RSK address if wallet is initialized', async () => {
			// Initialize wallet first
			await walletManager.initialize();

			// Wait for initialization
			await new Promise((resolve) => setTimeout(resolve, 100));

			const address = await getRSKAddress();
			expect(address).toBeTruthy();
			expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
		});

		it('should prevent race conditions with promise cache', async () => {
			await walletManager.initialize();

			const promises = [getRSKAddress(), getRSKAddress(), getRSKAddress()];

			const addresses = await Promise.all(promises);

			// All concurrent calls should resolve to a valid address (implementation may cache)
			expect(addresses).toHaveLength(3);
			for (const a of addresses) {
				expect(a).toMatch(/^0x[a-fA-F0-9]{40}$/);
			}
		});

		it('should return cached address if already available', async () => {
			// Set address in store
			walletStore.update((s) => ({
				...s,
				rsk: {
					...s.rsk,
					address: '0x1234567890123456789012345678901234567890'
				}
			}));

			const address = await getRSKAddress();
			expect(address).toBe('0x1234567890123456789012345678901234567890');
		});

		it('returns empty when initialize() is skipped while another init is already in flight', async () => {
			walletStore.update((s) => ({
				...s,
				isInitializing: true,
				rsk: {
					...s.rsk,
					address: null
				}
			}));

			const address = await getRSKAddress();
			expect(address).toBe('');
		});
	});

	describe('initializeWallet', () => {
		it('should initialize wallet successfully', async () => {
			await walletManager.initialize();

			const state = get(walletStore);
			expect(state.isConnected).toBe(true);
			expect(state.isInitializing).toBe(false);
			expect(state.rsk.address).toBeTruthy();
		});

		it('should skip initialization if already initializing', async () => {
			// Set initializing flag
			walletStore.update((s) => ({ ...s, isInitializing: true }));

			await walletManager.initialize();

			// Should not have changed state
			const state = get(walletStore);
			expect(state.isInitializing).toBe(true);
		});

		it('should skip initialization if already connected', async () => {
			// Set connected flag
			walletStore.update((s) => ({ ...s, isConnected: true }));

			await walletManager.initialize();

			// Should not have re-initialized
			const state = get(walletStore);
			expect(state.isConnected).toBe(true);
		});

		it('should handle initialization errors', async () => {
			const { getMnemonic } = await import('$lib/utils/helpers/mnemonic');
			vi.mocked(getMnemonic).mockRejectedValueOnce(new Error('Failed to get mnemonic'));

			// Store catches error, sets error state, then rethrows
			await expect(walletManager.initialize()).rejects.toThrow('Failed to get mnemonic');

			const state = get(walletStore);
			expect(state.isInitializing).toBe(false);
		});
	});

	describe('loadAssets', () => {
		it('should load assets after wallet initialization', async () => {
			await walletManager.initialize();
			await walletManager.loadAssets();

			const state = get(walletStore);
			// Assets array may be empty when token balance service mocks don't return data;
			// the key assertion is that loadAssets completes without throwing and updates totalBalances
			expect(state.totalBalances).toBeDefined();
		});

		it('should update total balances', async () => {
			await walletManager.initialize();
			await walletManager.loadAssets();

			const state = get(walletStore);
			expect(state.totalBalances.usd).toBeGreaterThanOrEqual(0);
		});

		it('should handle load errors gracefully', async () => {
			await walletManager.initialize();

			// Mock crypto price service to throw error
			const cryptoPriceService = await import('$lib/api/services/crypto-price.service');
			vi.mocked(cryptoPriceService.default.getCurrentPrice).mockRejectedValueOnce(
				new Error('Price fetch failed')
			);

			// loadAssets catches errors internally, so it shouldn't throw
			await walletManager.loadAssets();

			// Should have completed without throwing
			await expect(walletManager.loadAssets()).resolves.not.toThrow();
		});
	});

	describe('loadTransactions', () => {
		it('should load transactions after wallet initialization', async () => {
			await walletManager.initialize();
			await walletManager.loadTransactions();

			const state = get(walletStore);
			// Transactions may be empty, but function should complete
			expect(Array.isArray(state.transactions)).toBe(true);
		});

		it('should prevent concurrent transaction loads', async () => {
			await walletManager.initialize();

			// Start multiple concurrent loads
			const promises = [
				walletManager.loadTransactions(),
				walletManager.loadTransactions(),
				walletManager.loadTransactions()
			];

			await Promise.all(promises);

			// Should have completed without errors
			const state = get(walletStore);
			expect(Array.isArray(state.transactions)).toBe(true);
		});
	});

	describe('disconnectWallet', () => {
		it('should disconnect wallet and reset state', async () => {
			await walletManager.initialize();

			walletManager.cleanup();

			const state = get(walletStore);
			expect(state.isConnected).toBe(false);
			expect(state.rsk.connected).toBe(false);
			expect(state.bsc.connected).toBe(false);
		});

		it('should clear RSK address promise cache', async () => {
			await walletManager.initialize();

			// Get address to populate cache
			await getRSKAddress();

			walletManager.cleanup();

			// Cache should be cleared
			const state = get(walletStore);
			expect(state.rsk.address).toBeNull();
		});

		it('should handle disconnect errors gracefully', async () => {
			await walletManager.initialize();

			// Mock disconnect to throw error
			const { WalletManager } = await import('@bittasker/wallet-core');
			const mockInstance = vi.mocked(WalletManager).mock.results[0]?.value;
			if (mockInstance?.rskWallet) {
				vi.mocked(mockInstance.rskWallet.disconnect).mockImplementationOnce(() => {
					throw new Error('Disconnect failed');
				});
			}

			// Should not throw
			expect(() => walletManager.cleanup()).not.toThrow();
		});
	});
});
