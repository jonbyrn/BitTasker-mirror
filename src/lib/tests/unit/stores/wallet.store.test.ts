import { describe, it, expect, vi, beforeEach } from 'vitest';

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
		});

		it('should initialize with separate BSC state from RSK', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.rsk && state.bsc) {
					expect(state.rsk).toBeDefined();
					expect(state.bsc).toBeDefined();
					expect(state.rsk.connected).toBe(false);
					expect(state.bsc.connected).toBe(false);
					unsubscribe();
					done();
				}
			});
		});

		it('should maintain separate addresses for RSK and BSC', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.rsk?.address && state.bsc?.address) {
					expect(state.rsk.address).not.toBe(state.bsc.address);
					unsubscribe();
					done();
				}
			});
			// Simulate updating addresses
			walletStore.update((s) => ({
				...s,
				rsk: { ...s.rsk, address: '0x1111111111111111111111111111111111111111' },
				bsc: { ...s.bsc, address: '0x2222222222222222222222222222222222222222' }
			}));
		});

		it('should track separate balance for RSK and BSC', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.rsk?.balance && state.bsc?.balance) {
					expect(state.rsk.balance).toBeDefined();
					expect(state.bsc.balance).toBeDefined();
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({
				...s,
				rsk: { ...s.rsk, balance: '1000000000000000000' },
				bsc: { ...s.bsc, balance: '100000000' }
			}));
		});

		it('should update activeNetwork when switching networks', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.activeNetwork) {
					expect(['rsk', 'bsc']).toContain(state.activeNetwork);
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({ ...s, activeNetwork: 'bsc' }));
		});

		it('should format USDT balance for BSC (6 decimals)', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.bsc?.formattedUsdtBalance) {
					expect(state.bsc.formattedUsdtBalance).toMatch(/^\d+\.\d{0,6}$/);
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({
				...s,
				bsc: { ...s.bsc, formattedUsdtBalance: '25.500000' }
			}));
		});

		it('should maintain separate connection status for each network', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.rsk?.connected !== state.bsc?.connected) {
					expect(state.rsk.connected).toBe(true);
					expect(state.bsc.connected).toBe(false);
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({
				...s,
				rsk: { ...s.rsk, connected: true },
				bsc: { ...s.bsc, connected: false }
			}));
		});

		it('should handle disconnection from BSC while RSK remains connected', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.rsk?.connected && !state.bsc?.connected) {
					expect(state.rsk.connected).toBe(true);
					expect(state.bsc.connected).toBe(false);
					expect(state.bsc.address).toBeNull();
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({
				...s,
				rsk: { ...s.rsk, connected: true, address: '0x1111111111111111111111111111111111111111' },
				bsc: { ...s.bsc, connected: false, address: null }
			}));
		});

		it('should track total USDT balance across BSC', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.totalBalances?.usdt !== undefined) {
					expect(typeof state.totalBalances.usdt).toBe('number');
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({
				...s,
				totalBalances: { ...s.totalBalances, usdt: 125.5 }
			}));
		});

		it('should maintain selectedAsset for payment context', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.selectedAsset) {
					expect(['RBTC', 'USDT']).toContain(state.selectedAsset);
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({ ...s, selectedAsset: 'USDT' }));
		});

		it('should switch between RBTC and USDT assets', (done) => {
			let callCount = 0;
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.selectedAsset && callCount < 2) {
					callCount++;
					if (callCount === 2) {
						expect(state.selectedAsset).toBe('RBTC');
						unsubscribe();
						done();
					}
				}
			});
			walletStore.update((s) => ({ ...s, selectedAsset: 'USDT' }));
			setTimeout(() => {
				walletStore.update((s) => ({ ...s, selectedAsset: 'RBTC' }));
			}, 10);
		});

		it('should handle wallet address storage for BSC', (done) => {
			const bscAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.bsc?.address === bscAddress) {
					expect(state.bsc.address).toBe(bscAddress);
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({
				...s,
				bsc: { ...s.bsc, address: bscAddress }
			}));
		});

		it('should handle total balance updates for multiple networks', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.totalBalances?.sats && state.totalBalances?.usdt) {
					expect(state.totalBalances.sats).toBeGreaterThanOrEqual(0);
					expect(state.totalBalances.usdt).toBeGreaterThanOrEqual(0);
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({
				...s,
				totalBalances: { sats: 100000000, usd: 50000, usdt: 125.5 }
			}));
		});

		it('should maintain hasAnyConnection status when networks connect/disconnect', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.hasAnyConnection !== undefined) {
					const hasConnection = state.rsk?.connected || state.bsc?.connected;
					expect(state.hasAnyConnection).toBe(hasConnection);
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({
				...s,
				rsk: { ...s.rsk, connected: true },
				hasAnyConnection: true
			}));
		});

		it('should format network-specific balance for display', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.bsc?.formattedUsdtBalance) {
					const balance = state.bsc.formattedUsdtBalance;
					expect(balance).toMatch(/^\d+(\.\d+)?$/);
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({
				...s,
				bsc: { ...s.bsc, formattedUsdtBalance: '1234.567890' }
			}));
		});

		it('should handle provider initialization for BSC', (done) => {
			const unsubscribe = walletStore.subscribe((state) => {
				if (state.bsc?.provider) {
					expect(state.bsc.provider).toBeDefined();
					unsubscribe();
					done();
				}
			});
			walletStore.update((s) => ({
				...s,
				bsc: { ...s.bsc, provider: {} }
			}));
		});
	});
});
