import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the SDK before importing wallet.store
vi.mock('@bittasker/wallet-core', () => ({
	WalletManager: vi.fn()
}));

import { get } from 'svelte/store';
import { walletStore, allAssets, totalBalances } from '$lib/stores/wallet.store';
import { AssetFactory } from '../../utils/test-data-factories';

// We need to access hasLoadedAssets, but it's not exported. We'll test through the derived store behavior.

describe('Wallet Store State Management', () => {
	beforeEach(() => {
		// Reset to initial state
		walletStore.set({
			isInitializing: false,
			isConnected: false,
			isConnecting: false,
			hasAnyConnection: false,
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
			activeTab: 'balance',
			selectedAsset: 'rBTC'
		} as unknown as ReturnType<typeof walletStore.set> extends (val: infer V) => void ? V : never);
	});

	describe('walletStore', () => {
		it('should update state correctly', () => {
			walletStore.update(s => ({
				...s,
				isConnected: true,
				rsk: {
					...s.rsk,
					connected: true,
					address: '0x1234567890123456789012345678901234567890'
				}
			}));

			const state = get(walletStore);
			expect(state.isConnected).toBe(true);
			expect(state.rsk.connected).toBe(true);
			expect(state.rsk.address).toBe('0x1234567890123456789012345678901234567890');
		});

		it('should maintain state immutability', () => {
			const initialState = get(walletStore);
			
			walletStore.update(s => ({
				...s,
				isConnected: true
			}));

			const newState = get(walletStore);
			expect(initialState.isConnected).toBe(false);
			expect(newState.isConnected).toBe(true);
		});
	});

	describe('allAssets derived store', () => {
		it('should return empty array when no assets', () => {
			const assets = get(allAssets);
			expect(assets).toEqual([]);
		});

		it('should return all assets from store', () => {
			const mockAssets = [
				AssetFactory.createRSKAsset(),
				AssetFactory.createBSCBNBAsset(),
				AssetFactory.createBSCUSDTAsset()
			];

			walletStore.update(s => ({
				...s,
				assets: mockAssets
			}));

			const assets = get(allAssets);
			expect(assets).toEqual(mockAssets);
			expect(assets.length).toBe(3);
		});
	});

	describe('totalBalances derived store', () => {
		it('should return zero balances initially', () => {
			const balances = get(totalBalances);
			expect(balances.usd).toBe(0);
			expect(balances.sats).toBe(0);
			expect(balances.rbtc).toBe(0);
		});

		it('should return balances from store', () => {
			const mockBalances = {
				usd: 1000,
				sats: 100000000,
				rbtc: 1,
				usdt: 100,
				bnb: 0.5
			};

			walletStore.update(s => ({
				...s,
				totalBalances: mockBalances
			}));

			const balances = get(totalBalances);
			expect(balances.usd).toBe(1000);
			expect(balances.sats).toBe(100000000);
			expect(balances.rbtc).toBe(1);
		});
	});

	describe('State persistence and recovery', () => {
		it('should maintain state across updates', () => {
			// Set initial state
			walletStore.update(s => ({
				...s,
				isConnected: true,
				rsk: {
					...s.rsk,
					address: '0x1234567890123456789012345678901234567890',
					balance: '1000000000000000000'
				}
			}));

			// Update another field - activeTab not in type, so use type assertion
			walletStore.update(s => ({
				...s,
				activeTab: 'transactions'
			} as any));

			const state = get(walletStore);
			expect(state.isConnected).toBe(true);
			expect(state.rsk.address).toBe('0x1234567890123456789012345678901234567890');
			expect(state.rsk.balance).toBe('1000000000000000000');
			expect((state as unknown as { activeTab: string }).activeTab).toBe('transactions');
		});
	});

	describe('Error state handling', () => {
		it('should store error messages', () => {
			const errorMessage = 'Failed to connect to wallet';
			
			walletStore.update(s => ({
				...s,
				error: errorMessage
			}));

			const state = get(walletStore);
			expect(state.error).toBe(errorMessage);
		});

		it('should clear error on successful operation', () => {
			// Set error
			walletStore.update(s => ({
				...s,
				error: 'Previous error'
			}));

			// Clear error
			walletStore.update(s => ({
				...s,
				error: null
			}));

			const state = get(walletStore);
			expect(state.error).toBeNull();
		});
	});
});


