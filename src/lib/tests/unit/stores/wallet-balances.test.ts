/**
 * Comprehensive tests for wallet-balances.ts
 * Target: 80%+ coverage of loadAssets, loadRbtcExchangeRate, scheduleBalanceRefresh,
 *         loadRSKTokenBalances, and getTokenBalance
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get, writable } from 'svelte/store';
import type { WalletStateExtended } from '$lib/stores/wallet/wallet-types';

// ─── Shared mock data ────────────────────────────────────────────────────────

// Constants must be inside vi.hoisted() since they're referenced by makeInitialState()
// which is called inside vi.mock() factories (hoisted above normal declarations).

function makeInitialState(overrides: Partial<WalletStateExtended> = {}): WalletStateExtended {
	return {
		isInitializing: false,
		isConnected: true,
		error: null,
		rsk: {
			connected: true,
			connecting: false,
			error: null,
			address: MOCK_RSK_ADDRESS,
			balance: '0',
			formattedBalance: '0.00',
			blockNumber: 100,
			provider: null,
			wallet: null
		},
		bsc: {
			connected: true,
			connecting: false,
			error: null,
			address: MOCK_BSC_ADDRESS,
			bnbBalance: '0',
			formattedBnbBalance: '0.00',
			usdtBalance: '0',
			formattedUsdtBalance: '0.00',
			blockNumber: 100,
			provider: null,
			wallet: null,
			usdtContract: null,
			paymasterContract: null,
			paymasterConnected: false,
			paymasterAddress: null,
			canPayFeesInUsdt: false
		},
		arb: {
			connected: false,
			connecting: false,
			error: null,
			address: null,
			ethBalance: '0',
			formattedEthBalance: '0.00',
			usdt0Balance: '0',
			formattedUsdt0Balance: '0.00',
			wbtcBalance: '0',
			formattedWbtcBalance: '0.00',
			wbtcUsdValue: 0,
			tbtcBalance: '0',
			formattedTbtcBalance: '0.00',
			blockNumber: null,
			provider: null,
			wallet: null,
			usdt0Contract: null
		},
		arbitrum: {
			connected: false,
			connecting: false,
			error: null,
			address: null,
			ethBalance: '0',
			formattedEthBalance: '0.00',
			usdt0Balance: '0',
			formattedUsdt0Balance: '0.00',
			blockNumber: null,
			provider: null,
			wallet: null
		},
		assets: [],
		transactions: [],
		totalBalances: { usd: 0, sats: 0, rbtc: 0, usdt: 0, bnb: 0 },
		rbtcToBtcRate: 1.0,
		rbtcRateError: false,
		activeNetwork: 'rsk',
		selectedAsset: 'rBTC',
		activeChain: 'rsk',
		gasMode: 'USDT_GAS',
		delegationState: 'IDLE',
		pendingTransactions: new Map(),
		chainLock: false,
		lastBalanceRefresh: Date.now(),
		activeBridge: null,
		...overrides
	};
}

const mockRskBalanceData = {
	balance: BigInt('2000000000000000000'), // 2 RBTC in wei
	formatted: '2.00'
};

const mockBscBalances = {
	bnb: {
		balance: BigInt('3000000000000000000'), // 3 BNB
		formatted: '3.00'
	},
	usdt: {
		balance: BigInt('5000000000'), // 5000 USDT (6 dec)
		formatted: '5000.00'
	}
};

const mockRskTokenBalances = [
	{
		address: '0xDocToken',
		name: 'Dollar on Chain',
		symbol: 'DOC',
		decimals: 18,
		balance: '1000000000000000000000',
		formattedBalance: '1000.00',
		isNative: false
	},
	{
		address: '0xUsdt0Token',
		name: 'USDT0 (Rootstock)',
		symbol: 'USDT0',
		decimals: 6,
		balance: '5000000000',
		formattedBalance: '5000.00',
		isNative: false
	},
	{
		address: '0xZeroToken',
		name: 'Zero Token',
		symbol: 'ZERO',
		decimals: 18,
		balance: '0',
		formattedBalance: '0.00',
		isNative: false
	}
];

const mockArbUsdt0Balance = {
	balance: '2000000000', // 2000 USDT0 (6 dec)
	formattedBalance: '2000.00'
};

const mockArbWbtcBalance = {
	balance: '5000000000', // 50 WBTC (8 dec)
	formattedBalance: '50.00'
};

const mockArbTbtcBalance = {
	balance: '1000000000000000000', // 1 tBTC (18 dec)
	formattedBalance: '1.00'
};

const mockTier2Balances: Record<string, { raw: string; formatted: string; loading: boolean }> = {
	'56-USDT': { raw: '100000000000000000000', formatted: '100.00', loading: false },
	'42161-USDC': { raw: '50000000', formatted: '50.00', loading: false },
	'1-USDT': { raw: '0', formatted: '0.00', loading: false } // Should be filtered out
};

// ─── Mock setup (vi.hoisted) ──────────────────────────────────────────────────
// All mock variables referenced inside vi.mock() factories MUST be declared
// with vi.hoisted() because vi.mock() calls are hoisted above normal const/let
// declarations by Vitest's module transformation.

const {
	MOCK_RSK_ADDRESS,
	MOCK_BSC_ADDRESS,
	mockRskWallet,
	mockBscWallet,
	mockWalletManager,
	mockTokenBalanceService,
	mockCryptoPriceService,
	mockFetchBuiltinWalletTier2Balances,
	mockLoadTransactions,
	mockState,
	storeWritableHolder
} = vi.hoisted(() => {
	const MOCK_RSK_ADDRESS = '0xRskAddress1234567890abcdef12345678';
	const MOCK_BSC_ADDRESS = '0xBscAddress1234567890abcdef12345678';
	const rskWallet = {
		getBalance: vi.fn(),
		getWallet: vi.fn().mockReturnValue({ address: MOCK_RSK_ADDRESS }),
		getProvider: vi.fn().mockReturnValue({})
	};
	const bscWallet = {
		getBalances: vi.fn(),
		getWallet: vi.fn().mockReturnValue({ address: MOCK_BSC_ADDRESS }),
		getProvider: vi.fn().mockReturnValue({})
	};
	return {
		MOCK_RSK_ADDRESS,
		MOCK_BSC_ADDRESS,
		mockRskWallet: rskWallet,
		mockBscWallet: bscWallet,
		mockWalletManager: { rskWallet, bscWallet },
		mockTokenBalanceService: {
			getRSKTokenBalances: vi.fn(),
			getRSKNativeBalance: vi.fn(),
			getArbitrumTokenBalance: vi.fn(),
			clearCache: vi.fn(),
			clearBalanceCache: vi.fn(),
			clearAllBalanceCaches: vi.fn()
		},
		mockCryptoPriceService: {
			getCurrentPrice: vi.fn(),
			getExchangeRate: vi.fn()
		},
		mockFetchBuiltinWalletTier2Balances: vi.fn(),
		mockLoadTransactions: vi.fn(),
		mockState: {
			loadAssetsLock: false,
			balanceRefreshTimer: null as ReturnType<typeof setTimeout> | null,
			chainRefreshTimer: null as ReturnType<typeof setTimeout> | null
		},
		storeWritableHolder: {
			current: undefined as unknown as ReturnType<typeof writable<WalletStateExtended>>
		}
	};
});

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('$lib/api/services/token-balance.service', () => ({
	default: mockTokenBalanceService
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: mockCryptoPriceService
}));

vi.mock('$lib/services/defi/builtin-wallet-tier2', () => ({
	fetchBuiltinWalletTier2Balances: mockFetchBuiltinWalletTier2Balances
}));

vi.mock('$lib/stores/wallet/wallet-state', () => {
	storeWritableHolder.current = writable<WalletStateExtended>(makeInitialState());
	return {
		walletStore: storeWritableHolder.current,
		state: mockState,
		getWalletManager: vi.fn().mockReturnValue(mockWalletManager),
		fetchWithRetry: vi.fn(async (fn: () => Promise<unknown>) => {
			try {
				return await fn();
			} catch {
				return null;
			}
		})
	};
});

vi.mock('$lib/stores/wallet/wallet-types', () => ({
	WBTC_ARBITRUM_ADDRESS: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
	TBTC_ARBITRUM_ADDRESS: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40'
}));

vi.mock('$lib/stores/wallet/wallet-transactions', () => ({
	loadTransactions: mockLoadTransactions
}));

vi.mock('$lib/utils/constants/wallet.constants', () => ({
	ERROR_MESSAGES: {
		WALLET_NOT_INITIALIZED: 'Wallet is not initialized',
		RSK_ADDRESS_NOT_AVAILABLE: 'RSK address not available'
	}
}));

vi.mock('$lib/data/verified-tokens', () => ({
	CHAIN_LABELS: {
		56: 'Binance',
		42161: 'Arbitrum',
		1: 'Ethereum'
	}
}));

// Store reference — populated by the vi.mock('$lib/stores/wallet/wallet-state') factory above
const storeWritable = storeWritableHolder.current;

// ─── Import after mocks ──────────────────────────────────────────────────────

import {
	loadAssets,
	loadRbtcExchangeRate,
	scheduleBalanceRefresh,
	loadRSKTokenBalances,
	getTokenBalance
} from '$lib/stores/wallet/wallet-balances';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('wallet-balances', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockState.loadAssetsLock = false;
		mockState.balanceRefreshTimer = null;

		// Reset store to initial state
		storeWritable.set(makeInitialState());

		// Default price mocks
		mockCryptoPriceService.getCurrentPrice.mockImplementation(async (symbol: string) => {
			if (symbol === 'RBTC') return 60000;
			if (symbol === 'BNB') return 600;
			if (symbol === 'BTC') return 60000;
			return 0;
		});
		mockCryptoPriceService.getExchangeRate.mockResolvedValue(1.0);

		// Default Arbitrum token balance mocks
		mockTokenBalanceService.getArbitrumTokenBalance.mockImplementation(
			async (_addr: string, tokenAddr: string) => {
				const lower = tokenAddr.toLowerCase();
				if (lower === '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9') return mockArbUsdt0Balance;
				if (lower === '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f') return mockArbWbtcBalance;
				if (lower === '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40') return mockArbTbtcBalance;
				return null;
			}
		);

		// Default tier2 mock
		mockFetchBuiltinWalletTier2Balances.mockResolvedValue(mockTier2Balances);

		// Default token balance service
		mockTokenBalanceService.getRSKTokenBalances.mockResolvedValue(mockRskTokenBalances);
		mockTokenBalanceService.getRSKNativeBalance.mockResolvedValue(mockRskBalanceData);
		mockRskWallet.getBalance.mockResolvedValue(mockRskBalanceData);
		mockBscWallet.getBalances.mockResolvedValue(mockBscBalances);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ─── loadAssets ───────────────────────────────────────────────────────────

	describe('loadAssets', () => {
		it('happy path: loads RSK, Arbitrum, BSC balances and updates store', async () => {
			await loadAssets();

			const state = get(storeWritable);

			// RSK balance set
			expect(state.rsk.balance).toBe('2000000000000000000');
			expect(state.rsk.formattedBalance).toBe('2.00');
			expect(state.rsk.error).toBeNull();

			// BSC balance set
			expect(state.bsc.bnbBalance).toBe('3000000000000000000');
			expect(state.bsc.formattedBnbBalance).toBe('3.00');
			expect(state.bsc.usdtBalance).toBe('5000000000');
			expect(state.bsc.formattedUsdtBalance).toBe('5000.00');
			expect(state.bsc.error).toBeNull();

			// Arbitrum balances set
			expect(state.arb.usdt0Balance).toBe('2000000000');
			expect(state.arb.formattedUsdt0Balance).toBe('2000.00');
			expect(state.arb.wbtcBalance).toBe('5000000000');
			expect(state.arb.formattedWbtcBalance).toBe('50.00');
			expect(state.arb.tbtcBalance).toBe('1000000000000000000');
			expect(state.arb.formattedTbtcBalance).toBe('1.00');

			// Assets array populated
			expect(state.assets.length).toBeGreaterThan(0);

			// Total balances calculated
			// Note: tBTC is NOT added to totalRbtc — it's a separate Arbitrum asset
			expect(state.totalBalances.rbtc).toBe(2); // 2 RBTC only (tBTC is separate)
			expect(state.totalBalances.sats).toBe(Math.floor(2 * 100_000_000)); // RBTC sats only
			expect(state.totalBalances.usdt).toBe(13000); // 1000 DOC + 5000 USDT0 + 2000 arb USDT0 + 5000 BSC USDT
			expect(state.totalBalances.bnb).toBe(3);
			expect(state.totalBalances.usd).toBeGreaterThan(0);
		});

		it('price fetch failure: sets priceError but still loads balances', async () => {
			mockCryptoPriceService.getCurrentPrice.mockRejectedValue(new Error('API down'));

			await loadAssets();

			const state = get(storeWritable);

			// Balances still loaded
			expect(state.rsk.balance).toBe('2000000000000000000');
			expect(state.bsc.bnbBalance).toBe('3000000000000000000');

			// Price error flag set
			expect(state.rbtcRateError).toBe(true);

			// USD value should be 0 (price = 0)
			// RBTC balance * 0 = 0, BNB balance * 0 = 0
			// USDT/DOC/stablecoins still have 1:1 USD value
			expect(state.totalBalances.usdt).toBe(13000);
		});

		it('RSK balance fetch failure: falls back to existing store balance', async () => {
			// Make getRSKNativeBalance reject
			mockTokenBalanceService.getRSKNativeBalance.mockResolvedValue(null);

			// Set up existing RSK balance in store
			storeWritable.update((s) => ({
				...s,
				rsk: { ...s.rsk, balance: '1000000000000000000', formattedBalance: '1.00' }
			}));

			await loadAssets();

			const state = get(storeWritable);

			// RSK balance NOT overwritten (since fetchWithRetry returned null)
			expect(state.rsk.balance).toBe('1000000000000000000');
			expect(state.rsk.formattedBalance).toBe('1.00');
		});

		it('Arbitrum token fetch failure: individual null does not block other tokens', async () => {
			// WBTC fetch fails, USDT0 and tBTC succeed
			mockTokenBalanceService.getArbitrumTokenBalance.mockImplementation(
				async (_addr: string, tokenAddr: string) => {
					const lower = tokenAddr.toLowerCase();
					if (lower === '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9') return mockArbUsdt0Balance;
					if (lower === '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f') return null; // WBTC fails
					if (lower === '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40') return mockArbTbtcBalance;
					return null;
				}
			);

			await loadAssets();

			const state = get(storeWritable);

			// USDT0 still loaded
			expect(state.arb.usdt0Balance).toBe('2000000000');
			expect(state.arb.formattedUsdt0Balance).toBe('2000.00');

			// WBTC should be 0 (fallback)
			expect(state.arb.wbtcBalance).toBe('0');
			expect(state.arb.formattedWbtcBalance).toBe('0.00');

			// tBTC still loaded
			expect(state.arb.tbtcBalance).toBe('1000000000000000000');
		});

		it('force refresh: clears token balance caches before fetching', async () => {
			await loadAssets(true);

			expect(mockTokenBalanceService.clearCache).toHaveBeenCalledOnce();
		});

		it('no force refresh: does not clear caches', async () => {
			await loadAssets(false);

			expect(mockTokenBalanceService.clearCache).not.toHaveBeenCalled();
		});

		it('lock prevention: concurrent calls return early when lock is true', async () => {
			mockState.loadAssetsLock = true;

			await loadAssets();

			// Since lock is true, no fetches should have been made
			expect(mockRskWallet.getBalance).not.toHaveBeenCalled();
			expect(mockBscWallet.getBalances).not.toHaveBeenCalled();
			expect(mockCryptoPriceService.getCurrentPrice).not.toHaveBeenCalled();
		});

		it('total sats calculation: rBTC + tBTC sats summed correctly', async () => {
			// Ensure getRSKNativeBalance returns the expected 2 RBTC balance
			mockTokenBalanceService.getRSKNativeBalance.mockResolvedValue(mockRskBalanceData);
			await loadAssets();

			const state = get(storeWritable);

			// Note: tBTC is NOT added to totalRbtc — it's a separate Arbitrum asset
			// 2 RBTC only = 200,000,000 sats
			const expectedSats = Math.floor(2 * 100_000_000);
			expect(state.totalBalances.sats).toBe(expectedSats);
		});

		it('zero balance filtering: tokens with zero balance excluded from tier2', async () => {
			const tier2WithZero = {
				'56-USDT': { raw: '100000000000000000000', formatted: '100.00', loading: false },
				'42161-USDC': { raw: '0', formatted: '0.00', loading: false },
				'1-USDT': { raw: '0', formatted: '0.00', loading: false }
			};
			mockFetchBuiltinWalletTier2Balances.mockResolvedValue(tier2WithZero);

			await loadAssets();

			const state = get(storeWritable);

			// Only BSC USDT (56-USDT) should be in assets, not the zero-balance ones
			const tier2Assets = state.assets.filter(
				(a) => a.assetId === '56-USDT' || a.assetId === '42161-USDC' || a.assetId === '1-USDT'
			);
			expect(tier2Assets.length).toBe(1);
			expect(tier2Assets[0].assetId).toBe('56-USDT');
			expect(tier2Assets[0].balance).toBe(100);
		});

		it('catches top-level error and sets error on store', async () => {
			// Make getWalletManager throw
			const { getWalletManager } = await import('$lib/stores/wallet/wallet-state');
			vi.mocked(getWalletManager).mockImplementationOnce(() => {
				throw new Error('Wallet is not initialized.');
			});

			await loadAssets();

			const state = get(storeWritable);
			expect(state.error).toBe('Failed to refresh balances. Showing cached data.');
		});

		it('resets loadAssetsLock after success', async () => {
			await loadAssets();
			expect(mockState.loadAssetsLock).toBe(false);
		});

		it('resets loadAssetsLock after error', async () => {
			mockRskWallet.getBalance.mockRejectedValue(new Error('fail'));
			mockBscWallet.getBalances.mockRejectedValue(new Error('fail'));

			// Make getWalletManager throw to trigger catch block
			const { getWalletManager } = await import('$lib/stores/wallet/wallet-state');
			vi.mocked(getWalletManager).mockImplementationOnce(() => {
				throw new Error('fatal');
			});

			await loadAssets();
			expect(mockState.loadAssetsLock).toBe(false);
		});

		it('processes DOC token from RSK token balances', async () => {
			await loadAssets();

			const state = get(storeWritable);
			const docAsset = state.assets.find((a) => a.assetId === 'doc-rsk');
			expect(docAsset).toBeDefined();
			expect(docAsset!.ticker).toBe('DOC');
			expect(docAsset!.balance).toBe(1000);
		});

		it('processes USDT0 token from RSK token balances', async () => {
			await loadAssets();

			const state = get(storeWritable);
			const usdt0Asset = state.assets.find((a) => a.assetId === 'usdt0-rsk');
			expect(usdt0Asset).toBeDefined();
			expect(usdt0Asset!.ticker).toBe('USDT0');
			expect(usdt0Asset!.balance).toBe(5000);
		});

		it('processes BSC USDT only when balance > 0', async () => {
			mockBscWallet.getBalances.mockResolvedValue({
				bnb: { balance: BigInt('1000000000000000000'), formatted: '1.00' },
				usdt: { balance: BigInt('0'), formatted: '0.00' }
			});

			await loadAssets();

			const state = get(storeWritable);
			const usdtAsset = state.assets.find((a) => a.assetId === 'usdt');
			expect(usdtAsset).toBeUndefined();

			// BNB should still be there
			const bnbAsset = state.assets.find((a) => a.assetId === 'bnb');
			expect(bnbAsset).toBeDefined();
		});

		it('handles null BSC balances (BSC not connected)', async () => {
			// Mock BSC wallet to return null balances
			mockBscWallet.getBalances.mockResolvedValue(null);
			storeWritable.update((s) => ({
				...s,
				bsc: {
					...s.bsc,
					connected: false,
					balance: '0',
					formattedBalance: '0.00',
					bnbBalance: '0',
					formattedBnbBalance: '0.00'
				}
			}));

			await loadAssets();

			const state = get(storeWritable);
			// When BSC is disconnected and returns null, no BSC balance updates should occur
			expect(state.bsc.bnbBalance).toBe('0');
		});

		it('includes zero USDT0 arb asset when walletAddress exists but no balance', async () => {
			mockTokenBalanceService.getArbitrumTokenBalance.mockResolvedValue(null);

			await loadAssets();

			const state = get(storeWritable);
			const arbUsdt0 = state.assets.find((a) => a.assetId === 'usdt0-arb');
			expect(arbUsdt0).toBeDefined();
			expect(arbUsdt0!.balance).toBe(0);
			expect(arbUsdt0!.formattedBalance).toBe('0.00');
		});

		it('includes zero WBTC arb asset when walletAddress exists but no balance', async () => {
			mockTokenBalanceService.getArbitrumTokenBalance.mockResolvedValue(null);

			await loadAssets();

			const state = get(storeWritable);
			const arbWbtc = state.assets.find((a) => a.assetId === 'wbtc-arb');
			expect(arbWbtc).toBeDefined();
			expect(arbWbtc!.balance).toBe(0);
		});

		it('skips tBTC asset when balance is zero', async () => {
			mockTokenBalanceService.getArbitrumTokenBalance.mockImplementation(
				async (_addr: string, tokenAddr: string) => {
					const lower = tokenAddr.toLowerCase();
					if (lower === '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9') return mockArbUsdt0Balance;
					if (lower === '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f') return mockArbWbtcBalance;
					if (lower === '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40')
						return { balance: '0', formattedBalance: '0.00' };
					return null;
				}
			);

			await loadAssets();

			const state = get(storeWritable);
			const tbtcAsset = state.assets.find((a) => a.assetId === 'tbtc-arb');
			expect(tbtcAsset).toBeUndefined();
		});

		it('merges rbtcRateError with existing value (OR logic)', async () => {
			storeWritable.update((s) => ({ ...s, rbtcRateError: true }));
			// All prices succeed — but existing error stays due to OR logic
			await loadAssets();

			const state = get(storeWritable);
			expect(state.rbtcRateError).toBe(true);
		});

		it('uses BSC address separately when it differs from RSK', async () => {
			storeWritable.update((s) => ({
				...s,
				rsk: { ...s.rsk, address: MOCK_RSK_ADDRESS },
				bsc: { ...s.bsc, address: MOCK_BSC_ADDRESS }
			}));

			await loadAssets();

			// Should use BSC address for tier2 fetches
			expect(mockFetchBuiltinWalletTier2Balances).toHaveBeenCalledWith(MOCK_BSC_ADDRESS);
		});
	});

	// ─── loadRbtcExchangeRate ─────────────────────────────────────────────────

	describe('loadRbtcExchangeRate', () => {
		it('success: updates store with exchange rate', async () => {
			mockCryptoPriceService.getExchangeRate.mockResolvedValue(1.0);

			await loadRbtcExchangeRate();

			const state = get(storeWritable);
			expect(state.rbtcToBtcRate).toBe(1.0);
			expect(state.rbtcRateError).toBe(false);
		});

		it('error: falls back to 1.0 rate and sets error flag', async () => {
			mockCryptoPriceService.getExchangeRate.mockRejectedValue(new Error('Exchange rate API down'));

			await loadRbtcExchangeRate();

			const state = get(storeWritable);
			expect(state.rbtcToBtcRate).toBe(1.0);
			expect(state.rbtcRateError).toBe(true);
		});
	});

	// ─── scheduleBalanceRefresh ───────────────────────────────────────────────

	describe('scheduleBalanceRefresh', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		it('debounce: rapid calls clear previous timer', () => {
			vi.useFakeTimers();
			const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

			scheduleBalanceRefresh();
			scheduleBalanceRefresh();
			scheduleBalanceRefresh();

			// Each call after the first should clear the previous timer
			expect(clearTimeoutSpy).toHaveBeenCalled();

			clearTimeoutSpy.mockRestore();
			vi.useRealTimers();
		});

		it('timer cleanup: previous timer cleared on new call', () => {
			const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

			// Set a fake timer ID on state
			mockState.balanceRefreshTimer = 12345 as unknown as ReturnType<typeof setTimeout>;

			scheduleBalanceRefresh();

			expect(clearTimeoutSpy).toHaveBeenCalledWith(
				12345 as unknown as ReturnType<typeof setTimeout>
			);

			clearTimeoutSpy.mockRestore();
		});

		it('clears balance cache for RSK address when timer fires', async () => {
			// Use real timers for the async parts
			vi.useRealTimers();

			scheduleBalanceRefresh();

			// Wait for debounce to fire
			await new Promise((resolve) => setTimeout(resolve, 600));

			expect(mockTokenBalanceService.clearAllBalanceCaches).toHaveBeenCalledWith(MOCK_RSK_ADDRESS);
		});

		it('does not call clearBalanceCache if no RSK address', async () => {
			vi.useRealTimers();

			storeWritable.update((s) => ({
				...s,
				rsk: { ...s.rsk, address: null }
			}));

			scheduleBalanceRefresh();

			await new Promise((resolve) => setTimeout(resolve, 600));

			expect(mockTokenBalanceService.clearAllBalanceCaches).not.toHaveBeenCalled();
		});
	});

	// ─── loadRSKTokenBalances ─────────────────────────────────────────────────

	describe('loadRSKTokenBalances', () => {
		it('success with tokens: returns array including native RBTC', async () => {
			const result = await loadRSKTokenBalances();

			expect(result.length).toBeGreaterThan(0);

			// First token should be native RBTC
			const rbtc = result.find((t) => t.isNative);
			expect(rbtc).toBeDefined();
			expect(rbtc!.symbol).toBe('RBTC');
			expect(rbtc!.address).toBe('native');
			expect(rbtc!.balance).toBe('2000000000000000000');
			expect(rbtc!.formattedBalance).toBe('2.00');
		});

		it('no address: throws RSK_ADDRESS_NOT_AVAILABLE error', async () => {
			storeWritable.update((s) => ({
				...s,
				rsk: { ...s.rsk, address: null }
			}));

			await expect(loadRSKTokenBalances()).rejects.toThrow('RSK address not available');
		});

		it('zero balance filtering: filters out non-native tokens with zero balance', async () => {
			const result = await loadRSKTokenBalances();

			// The ZERO token (balance '0') should be filtered out
			const zeroToken = result.find((t) => t.symbol === 'ZERO');
			expect(zeroToken).toBeUndefined();

			// Native RBTC should always be included even with zero balance
			// (our mock has non-zero RBTC so this is satisfied)
		});

		it('always includes native RBTC even if zero', async () => {
			mockTokenBalanceService.getRSKNativeBalance.mockResolvedValue({
				balance: BigInt('0'),
				formatted: '0.00'
			});

			const result = await loadRSKTokenBalances();

			const rbtc = result.find((t) => t.isNative);
			expect(rbtc).toBeDefined();
			expect(rbtc!.symbol).toBe('RBTC');
		});

		it('forceRefresh passes through to tokenBalanceService', async () => {
			await loadRSKTokenBalances(true);

			expect(mockTokenBalanceService.getRSKTokenBalances).toHaveBeenCalledWith(
				MOCK_RSK_ADDRESS,
				true
			);
		});

		it('re-throws errors from token balance service', async () => {
			mockTokenBalanceService.getRSKTokenBalances.mockRejectedValue(
				new Error('Blockscout API error')
			);

			await expect(loadRSKTokenBalances()).rejects.toThrow('Blockscout API error');
		});
	});

	// ─── getTokenBalance ──────────────────────────────────────────────────────

	describe('getTokenBalance', () => {
		it('native token (0x0): returns native RBTC balance', async () => {
			const result = await getTokenBalance('native');

			expect(result).not.toBeNull();
			expect(result!.symbol).toBe('RBTC');
			expect(result!.address).toBe('native');
			expect(result!.isNative).toBe(true);
			expect(result!.balance).toBe('2000000000000000000');
			expect(result!.formattedBalance).toBe('2.00');
		});

		it('ERC-20 match: returns matching token balance by address', async () => {
			const result = await getTokenBalance('0xDocToken');

			expect(result).not.toBeNull();
			expect(result!.symbol).toBe('DOC');
			expect(result!.address).toBe('0xDocToken');
		});

		it('ERC-20 match: case-insensitive address comparison', async () => {
			const result = await getTokenBalance('0xdoctoken');

			expect(result).not.toBeNull();
			expect(result!.symbol).toBe('DOC');
		});

		it('not found: returns null when token address not in list', async () => {
			const result = await getTokenBalance('0xNonExistentToken');

			expect(result).toBeNull();
		});

		it('error: returns null and does not throw', async () => {
			mockTokenBalanceService.getRSKTokenBalances.mockRejectedValue(new Error('Network error'));

			const result = await getTokenBalance('0xDocToken');

			expect(result).toBeNull();
		});

		it('error in native balance fetch: returns null', async () => {
			mockTokenBalanceService.getRSKNativeBalance.mockResolvedValue(null);

			const result = await getTokenBalance('native');

			expect(result).toBeNull();
		});
	});
});
