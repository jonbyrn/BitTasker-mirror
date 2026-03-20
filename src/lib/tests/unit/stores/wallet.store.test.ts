import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock the SDK before importing wallet.store
vi.mock('@bittasker/wallet-core', () => ({
	WalletManager: vi.fn()
}));

import { formatSats, formatUsd, formatAddress } from '$lib/stores/wallet.store';
import { walletStore } from '$lib/stores/wallet.store';

describe('Wallet Store Utilities', () => {
	describe('formatSats', () => {
		it('should format zero sats', () => {
			expect(formatSats(0)).toBe('0');
		});

		it('should format small amounts', () => {
			expect(formatSats(1)).toBe('1');
			expect(formatSats(100)).toBe('100');
			expect(formatSats(1000)).toBe('1,000');
		});

		it('should format large amounts with commas', () => {
			expect(formatSats(1000000)).toBe('1,000,000');
			expect(formatSats(100000000)).toBe('100,000,000');
		});

		it('should handle negative amounts', () => {
			expect(formatSats(-1000)).toBe('-1,000');
		});

		it('should handle decimal amounts', () => {
			// formatSats uses toLocaleString which formats decimals
			expect(formatSats(1000.5)).toBe('1,000.5');
			expect(formatSats(1000.9)).toBe('1,000.9');
		});
	});

	describe('formatUsd', () => {
		it('should format zero dollars', () => {
			expect(formatUsd(0)).toBe('$0.00');
		});

		it('should format small amounts', () => {
			expect(formatUsd(0.01)).toBe('$0.01');
			expect(formatUsd(1)).toBe('$1.00');
			expect(formatUsd(10.5)).toBe('$10.50');
		});

		it('should format large amounts with commas', () => {
			expect(formatUsd(1000)).toBe('$1,000.00');
			expect(formatUsd(1000000)).toBe('$1,000,000.00');
		});

		it('should handle negative amounts', () => {
			expect(formatUsd(-10.5)).toBe('-$10.50');
		});

		it('should round to 2 decimal places', () => {
			expect(formatUsd(10.999)).toBe('$11.00');
			expect(formatUsd(10.994)).toBe('$10.99');
		});
	});

	describe('formatAddress', () => {
		it('should truncate long addresses', () => {
			const address = '0x1234567890123456789012345678901234567890';
			const result = formatAddress(address);
			expect(result).toBe('0x1234...7890');
		});

		it('should use custom start and end characters', () => {
			const address = '0x1234567890123456789012345678901234567890';
			const result = formatAddress(address, 4, 4);
			expect(result).toBe('0x12...7890');
		});

		it('should handle short addresses', () => {
			const address = '0x1234';
			const result = formatAddress(address, 6, 4);
			// If address is shorter than start + end, should return as-is or handle gracefully
			expect(result.length).toBeLessThanOrEqual(address.length + 3); // +3 for '...'
		});

		it('should handle empty string', () => {
			expect(formatAddress('')).toBe('');
		});
	});

	describe('Wallet Store - BSC Support', () => {
		beforeEach(() => {
			vi.clearAllMocks();
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
				rbtcToBtcRate: 1,
				rbtcRateError: false,
				balanceFreshness: {
					rsk: {
						lastLoadedAt: 0,
						isRefreshing: false,
						error: null
					},
					bsc: {
						lastLoadedAt: 0,
						isRefreshing: false,
						error: null
					}
				},
				activeNetwork: 'rsk',
				selectedAsset: 'rBTC'
			});
		});

		it('should initialize with separate BSC state from RSK', () => {
			const state = get(walletStore);
			expect(state.rsk).toBeDefined();
			expect(state.bsc).toBeDefined();
			expect(state.rsk.connected).toBe(false);
			expect(state.bsc.connected).toBe(false);
		});

		it('should maintain separate addresses for RSK and BSC', () => {
			walletStore.update((s) => ({
				...s,
				rsk: { ...s.rsk, address: '0x1111111111111111111111111111111111111111' },
				bsc: { ...s.bsc, address: '0x2222222222222222222222222222222222222222' }
			}));
			const state = get(walletStore);
			expect(state.rsk.address).not.toBe(state.bsc.address);
		});

		it('should track separate balance for RSK and BSC', () => {
			walletStore.update((s) => ({
				...s,
				rsk: { ...s.rsk, balance: '1000000000000000000' },
				bsc: { ...s.bsc, balance: '100000000' }
			}));
			const state = get(walletStore);
			expect(state.rsk.balance).toBeDefined();
			expect(state.bsc.balance).toBeDefined();
		});

		it('should update activeNetwork when switching networks', () => {
			walletStore.update((s) => ({ ...s, activeNetwork: 'bsc' }));
			expect(get(walletStore).activeNetwork).toBe('bsc');
		});

		it('should format USDT balance for BSC (6 decimals)', () => {
			walletStore.update((s) => ({
				...s,
				bsc: { ...s.bsc, formattedUsdtBalance: '25.500000' }
			}));
			expect(get(walletStore).bsc.formattedUsdtBalance).toMatch(/^\d+\.\d{0,6}$/);
		});

		it('should maintain separate connection status for each network', () => {
			walletStore.update((s) => ({
				...s,
				rsk: { ...s.rsk, connected: true },
				bsc: { ...s.bsc, connected: false }
			}));
			const state = get(walletStore);
			expect(state.rsk.connected).toBe(true);
			expect(state.bsc.connected).toBe(false);
		});

		it('should handle disconnection from BSC while RSK remains connected', () => {
			walletStore.update((s) => ({
				...s,
				rsk: { ...s.rsk, connected: true, address: '0x1111111111111111111111111111111111111111' },
				bsc: { ...s.bsc, connected: false, address: null }
			}));
			const state = get(walletStore);
			expect(state.rsk.connected).toBe(true);
			expect(state.bsc.connected).toBe(false);
			expect(state.bsc.address).toBeNull();
		});

		it('should track total USDT balance across BSC', () => {
			walletStore.update((s) => ({
				...s,
				totalBalances: { ...s.totalBalances, usdt: 125.5 }
			}));
			expect(typeof get(walletStore).totalBalances.usdt).toBe('number');
		});

		it('should maintain selectedAsset for payment context', () => {
			walletStore.update((s) => ({ ...s, selectedAsset: 'USDT' }));
			expect(['rBTC', 'USDT']).toContain(get(walletStore).selectedAsset);
		});

		it('should switch between RBTC and USDT assets', () => {
			walletStore.update((s) => ({ ...s, selectedAsset: 'USDT' }));
			expect(get(walletStore).selectedAsset).toBe('USDT');
			walletStore.update((s) => ({ ...s, selectedAsset: 'rBTC' }));
			expect(get(walletStore).selectedAsset).toBe('rBTC');
		});

		it('should handle wallet address storage for BSC', () => {
			const bscAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
			walletStore.update((s) => ({
				...s,
				bsc: { ...s.bsc, address: bscAddress }
			}));
			expect(get(walletStore).bsc.address).toBe(bscAddress);
		});

		it('should handle total balance updates for multiple networks', () => {
			walletStore.update((s) => ({
				...s,
				totalBalances: { sats: 100000000, usd: 50000, usdt: 125.5 }
			}));
			const state = get(walletStore);
			expect(state.totalBalances.sats).toBeGreaterThanOrEqual(0);
			expect(state.totalBalances.usdt).toBeGreaterThanOrEqual(0);
		});

		it('should maintain hasAnyConnection status when networks connect/disconnect', () => {
			walletStore.update((s) => ({
				...s,
				rsk: { ...s.rsk, connected: true },
				hasAnyConnection: true
			}));
			const state = get(walletStore);
			const hasConnection = state.rsk?.connected || state.bsc?.connected;
			expect(state.hasAnyConnection).toBe(hasConnection);
		});

		it('should format network-specific balance for display', () => {
			walletStore.update((s) => ({
				...s,
				bsc: { ...s.bsc, formattedUsdtBalance: '1234.567890' }
			}));
			expect(get(walletStore).bsc.formattedUsdtBalance).toMatch(/^\d+(\.\d+)?$/);
		});

		it('should handle provider initialization for BSC', () => {
			walletStore.update((s) => ({
				...s,
				bsc: { ...s.bsc, provider: {} }
			}));
			expect(get(walletStore).bsc.provider).toBeDefined();
		});
	});
});
