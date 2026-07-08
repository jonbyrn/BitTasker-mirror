/**
 * Wallet Balances — asset loading, token balances, exchange rates
 */

import type { WalletAsset } from '@bittasker/wallet-core';
import type { TokenBalance } from '$lib/types/wallet';
import { get } from 'svelte/store';
import { ERROR_MESSAGES } from '$lib/utils/constants/wallet.constants';
import tokenBalanceService from '$lib/api/services/token-balance.service';
import {
	fetchBuiltinWalletTier2Balances,
	type Tier2BalanceEntry
} from '$lib/services/defi/builtin-wallet-tier2';
import { CHAIN_LABELS } from '$lib/data/verified-tokens';
import cryptoPriceService from '$lib/api/services/crypto-price.service';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { walletStore, state, getWalletManager, fetchWithRetry } from './wallet-state';
import { WBTC_ARBITRUM_ADDRESS, TBTC_ARBITRUM_ADDRESS } from './wallet-types';

// ─── Internal helpers ────────────────────────────────────────────────────────

export function scheduleBalanceRefresh(): void {
	if (state.balanceRefreshTimer) clearTimeout(state.balanceRefreshTimer);
	state.balanceRefreshTimer = setTimeout(() => {
		state.balanceRefreshTimer = null;
		const address = get(walletStore).rsk.address;
		if (address) {
			tokenBalanceService.clearBalanceCache(address);
		}
		loadAssets().catch((err) => {
			console.error('[wallet] Balance refresh failed:', err);
		});
	}, 500);
}

// ─── Exported functions ──────────────────────────────────────────────────────

/**
 * Load RBTC to BTC exchange rate.
 * Updates the store with the current exchange rate or sets error flag on failure.
 */
export async function loadRbtcExchangeRate(): Promise<void> {
	try {
		const rate = await cryptoPriceService.getExchangeRate('RBTC', 'BTC');
		walletStore.update((s) => ({
			...s,
			rbtcToBtcRate: rate,
			rbtcRateError: false
		}));
	} catch (error) {
		console.error('Failed to load RBTC exchange rate:', error);
		walletStore.update((s) => ({
			...s,
			rbtcToBtcRate: 1.0,
			rbtcRateError: true
		}));
	}
}

/**
 * Load wallet assets and update balances from blockchain.
 * Fetches fresh balances for RSK and BSC networks and calculates total USD value.
 * Includes retry logic for transient failures.
 */
export async function loadAssets(forceRefresh = false): Promise<void> {
	if (state.loadAssetsLock) return;
	state.loadAssetsLock = true;
	try {
		const manager = getWalletManager();
		const storeState = get(walletStore);

		// When force-refreshing (e.g., user taps refresh button), clear all
		// token balance caches so on-chain data is re-fetched immediately.
		if (forceRefresh) {
			tokenBalanceService.clearCache();
		}
		const assets: WalletAsset[] = [];

		// Initialize totals
		let totalRbtc = 0;
		let totalBnb = 0;
		let totalUsdt = 0;
		let totalUsd = 0;
		let priceError = false;

		const walletAddress = storeState.rsk.address || storeState.bsc.address;
		// For BSC-specific queries, use the BSC address (may differ from RSK)
		const bscAddress = storeState.bsc.address || walletAddress;

		// Fetch ALL data in parallel with retry logic for balance fetches
		const [
			rbtcPriceResult,
			bnbPriceResult,
			btcPriceResult,
			rskBalanceData,
			bscBalances,
			rskTokenBalances,
			arbUsdt0Balance,
			arbWbtcBalance,
			arbTbtcBalance,
			tier2Balances
		] = await Promise.all([
			cryptoPriceService.getCurrentPrice('RBTC').catch((err) => {
				console.warn('[WALLET-STORE] Failed to fetch RBTC price:', err);
				return null;
			}),
			cryptoPriceService.getCurrentPrice('BNB').catch((err) => {
				console.warn('[WALLET-STORE] Failed to fetch BNB price:', err);
				return null;
			}),
			cryptoPriceService.getCurrentPrice('BTC').catch((err) => {
				console.warn('[WALLET-STORE] Failed to fetch BTC price:', err);
				return null;
			}),
			storeState.rsk.connected && manager.rskWallet
				? fetchWithRetry(() => manager.rskWallet.getBalance())
				: Promise.resolve(null),
			storeState.bsc.connected && manager.bscWallet
				? fetchWithRetry(() => manager.bscWallet.getBalances())
				: Promise.resolve(null),
			storeState.rsk.connected && walletAddress
				? fetchWithRetry(() => tokenBalanceService.getRSKTokenBalances(walletAddress, true))
				: Promise.resolve(null),
			walletAddress
				? fetchWithRetry(() =>
						tokenBalanceService.getArbitrumTokenBalance(
							walletAddress,
							'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT0 on Arbitrum
							6,
							forceRefresh
						)
					)
				: Promise.resolve(null),
			walletAddress
				? fetchWithRetry(() =>
						tokenBalanceService.getArbitrumTokenBalance(
							walletAddress,
							WBTC_ARBITRUM_ADDRESS,
							8,
							forceRefresh
						)
					)
				: Promise.resolve(null),
			walletAddress
				? fetchWithRetry(() =>
						tokenBalanceService.getArbitrumTokenBalance(
							walletAddress,
							TBTC_ARBITRUM_ADDRESS,
							18,
							forceRefresh
						)
					)
				: Promise.resolve(null),
			bscAddress ? fetchBuiltinWalletTier2Balances(bscAddress) : Promise.resolve({})
		]);

		// Use fallback price of 0 if price fetch failed, but track the error
		const rbtcPrice = rbtcPriceResult ?? 0;
		const bnbPrice = bnbPriceResult ?? 0;
		const _btcPrice = btcPriceResult ?? 0;
		if (rbtcPriceResult === null || bnbPriceResult === null || btcPriceResult === null) {
			priceError = true;
		}

		// Process RSK assets
		if (rskBalanceData) {
			const rbtcBalance = parseFloat(rskBalanceData.formatted);
			totalRbtc += rbtcBalance;
			const rbtcUsdValue = rbtcBalance * rbtcPrice;
			totalUsd += rbtcUsdValue;

			walletStore.update((s) => ({
				...s,
				rsk: {
					...s.rsk,
					balance: rskBalanceData.balance.toString(),
					formattedBalance: rskBalanceData.formatted,
					error: null
				}
			}));

			assets.push({
				assetId: 'rbtc',
				name: 'Rootstock Bitcoin',
				ticker: 'RBTC',
				precision: 8,
				icon: '₿',
				balance: rbtcBalance,
				formattedBalance: rskBalanceData.formatted,
				network: 'RSK',
				usdValue: rbtcUsdValue
			});
		} else if (storeState.rsk.connected) {
			// Balance fetch failed but we're connected — report error but keep existing balance
			walletStore.update((s) => ({
				...s,
				rsk: {
					...s.rsk,
					error: 'Failed to fetch balance. Please refresh.'
				}
			}));
		}

		// Process RSK token balances (DOC, USDT0, and other ERC-20 tokens)
		if (rskTokenBalances && rskTokenBalances.length > 0) {
			for (const token of rskTokenBalances) {
				const tokenBalance = parseFloat(token.formattedBalance || '0');
				if (tokenBalance <= 0) continue;

				if (token.symbol === 'DOC') {
					totalUsdt += tokenBalance;
					totalUsd += tokenBalance;

					assets.push({
						assetId: 'doc-rsk',
						name: token.name || 'DOC',
						ticker: 'DOC',
						precision: token.decimals || 18,
						icon: '📄',
						balance: tokenBalance,
						formattedBalance: token.formattedBalance || '0',
						network: 'RSK',
						usdValue: tokenBalance
					});
				} else if (token.symbol === 'USDT0' || token.symbol === 'USDT0 (Rootstock)') {
					totalUsdt += tokenBalance;
					totalUsd += tokenBalance;

					assets.push({
						assetId: 'usdt0-rsk',
						name: token.name || 'USDT0 (RSK)',
						ticker: 'USDT0',
						precision: token.decimals || 6,
						icon: '💵',
						balance: tokenBalance,
						formattedBalance: token.formattedBalance || '0',
						network: 'RSK',
						usdValue: tokenBalance
					});
				}
			}
		}

		// Process Arbitrum USDT0 balance
		if (arbUsdt0Balance) {
			const arbUsdt0Formatted = parseFloat(arbUsdt0Balance.formattedBalance || '0');
			const usdt0UsdValue = arbUsdt0Formatted; // USDT0 is 1:1 with USD

			totalUsdt += arbUsdt0Formatted;
			totalUsd += usdt0UsdValue;

			walletStore.update((s) => ({
				...s,
				arb: {
					...s.arb,
					usdt0Balance: arbUsdt0Balance.balance?.toString() || '0',
					formattedUsdt0Balance: arbUsdt0Balance.formattedBalance || '0.00',
					connected: true,
					error: null
				}
			}));

			assets.push({
				assetId: 'usdt0-arb',
				name: 'USDT0 (Arbitrum)',
				ticker: 'USDT0',
				precision: 6,
				icon: '💵',
				balance: arbUsdt0Formatted,
				formattedBalance: arbUsdt0Balance.formattedBalance || '0.00',
				network: 'RSK',
				usdValue: usdt0UsdValue
			});
		} else if (walletAddress) {
			assets.push({
				assetId: 'usdt0-arb',
				name: 'USDT0 (Arbitrum)',
				ticker: 'USDT0',
				precision: 6,
				icon: '💵',
				balance: 0,
				formattedBalance: '0.00',
				network: 'RSK',
				usdValue: 0
			});
		}

		// Process Arbitrum WBTC balance
		if (arbWbtcBalance) {
			const wbtcFormatted = parseFloat(arbWbtcBalance.formattedBalance || '0');
			const wbtcUsdValue = wbtcFormatted * (btcPriceResult ?? 0);

			totalUsd += wbtcUsdValue;

			walletStore.update((s) => ({
				...s,
				arb: {
					...s.arb,
					wbtcBalance: arbWbtcBalance.balance?.toString() || '0',
					formattedWbtcBalance: arbWbtcBalance.formattedBalance || '0.00',
					wbtcUsdValue,
					connected: true,
					error: null
				}
			}));

			assets.push({
				assetId: 'wbtc-arb',
				name: 'Bitcoin (wBTC)',
				ticker: 'WBTC',
				precision: 8,
				icon: '₿',
				balance: wbtcFormatted,
				formattedBalance: arbWbtcBalance.formattedBalance || '0.00',
				network: 'BSC' as WalletAsset['network'],
				usdValue: wbtcUsdValue
			});
		} else if (walletAddress) {
			assets.push({
				assetId: 'wbtc-arb',
				name: 'Bitcoin (wBTC)',
				ticker: 'WBTC',
				precision: 8,
				icon: '₿',
				balance: 0,
				formattedBalance: '0.00',
				network: 'BSC' as WalletAsset['network'],
				usdValue: 0
			});
		}

		// Process Arbitrum tBTC balance (only shown if balance > 0)
		if (arbTbtcBalance) {
			const tbtcFormatted = parseFloat(arbTbtcBalance.formattedBalance || '0');
			if (tbtcFormatted > 0) {
				const tbtcUsdValue = tbtcFormatted * (btcPriceResult ?? 0);
				totalRbtc += tbtcFormatted;
				totalUsd += tbtcUsdValue;

				walletStore.update((s) => ({
					...s,
					arb: {
						...s.arb,
						tbtcBalance: arbTbtcBalance.balance?.toString() || '0',
						formattedTbtcBalance: arbTbtcBalance.formattedBalance || '0.00'
					}
				}));

				assets.push({
					assetId: 'tbtc-arb',
					name: 'Bitcoin (tBTC)',
					ticker: 'TBTC',
					precision: 18,
					icon: '₿',
					balance: tbtcFormatted,
					formattedBalance: arbTbtcBalance.formattedBalance || '0',
					network: 'BSC' as WalletAsset['network'],
					usdValue: tbtcUsdValue
				});
			}
		}

		// Process tier 2 balances
		if (tier2Balances) {
			const entries = Object.entries(tier2Balances) as [string, Tier2BalanceEntry][];
			for (const [key, bal] of entries) {
				const balance = parseFloat(bal.formatted || '0');
				if (balance <= 0) continue;
				const chainId = parseInt(key.split('-')[0]);
				const symbol = key.split('-')[1] || 'USD';
				const chainLabel = CHAIN_LABELS[chainId] ?? `Chain ${chainId}`;
				assets.push({
					assetId: key,
					name: `${symbol} (${chainLabel})`,
					ticker: symbol,
					precision: 6,
					icon: '💵',
					balance,
					formattedBalance: bal.formatted || '0.00',
					network: 'BSC' as WalletAsset['network'],
					usdValue: balance
				});
				console.log('[WALLET-STORE] Tier2 asset:', key, '=', balance);
			}
		}

		// Process BSC assets
		if (bscBalances) {
			const bnbBalance = parseFloat(bscBalances.bnb.formatted);
			totalBnb += bnbBalance;
			const bnbUsdValue = bnbBalance * bnbPrice;
			totalUsd += bnbUsdValue;

			walletStore.update((s) => ({
				...s,
				bsc: {
					...s.bsc,
					bnbBalance: bscBalances.bnb.balance.toString(),
					usdtBalance: bscBalances.usdt.balance.toString(),
					formattedBnbBalance: bscBalances.bnb.formatted,
					formattedUsdtBalance: bscBalances.usdt.formatted,
					error: null
				}
			}));

			assets.push({
				assetId: 'bnb',
				name: 'BNB',
				ticker: 'BNB',
				precision: 8,
				icon: 'BNB',
				balance: bnbBalance,
				formattedBalance: bscBalances.bnb.formatted,
				network: 'BSC',
				usdValue: bnbUsdValue
			});

			if (bscBalances.usdt.balance > BigInt(0)) {
				const usdtBalance = parseFloat(bscBalances.usdt.formatted);
				totalUsdt += usdtBalance;
				totalUsd += usdtBalance; // USDT is 1:1 with USD

				assets.push({
					assetId: 'usdt',
					name: 'Tether USD',
					ticker: 'USDT',
					precision: 6,
					icon: '₮',
					balance: usdtBalance,
					formattedBalance: bscBalances.usdt.formatted,
					network: 'BSC',
					usdValue: usdtBalance
				});
			}
		}

		// Calculate total sats (RBTC to sats)
		const totalSats = Math.floor(totalRbtc * 100_000_000);

		// Update store with assets and totals
		console.log('[WALLET-STORE] committing assets:', assets.map((a) => a.assetId).join(', '));
		walletStore.update((s) => ({
			...s,
			assets,
			totalBalances: {
				usd: totalUsd,
				sats: totalSats,
				rbtc: totalRbtc,
				usdt: totalUsdt,
				bnb: totalBnb
			},
			rbtcRateError: priceError || s.rbtcRateError,
			lastBalanceRefresh: Date.now()
		}));

		// Persist balance for incoming fund detection across app kills
		try {
			await Preferences.set({
				key: StorageKeys.WALLET_LAST_BALANCE_SATS,
				value: totalSats.toString()
			});
		} catch {
			// Preferences unavailable (e.g. SSR or missing plugin)
		}
	} catch (error) {
		console.error('[WALLET-STORE] Failed to load assets:', error);
		walletStore.update((s) => ({
			...s,
			error: 'Failed to refresh balances. Showing cached data.'
		}));
	} finally {
		state.loadAssetsLock = false;
	}
}

/**
 * Load all RSK token balances from Blockscout API.
 * Includes RBTC (native) and all ERC-20 tokens with non-zero balances.
 * Filters out tokens with zero balance automatically.
 * Uses caching to reduce API calls.
 */
export async function loadRSKTokenBalances(forceRefresh = false): Promise<TokenBalance[]> {
	try {
		const manager = getWalletManager();
		const storeState = get(walletStore);
		const address = storeState.rsk.address;

		if (!address) {
			if (import.meta.env.DEV) {
				console.error('[WALLET-STORE] loadRSKTokenBalances() - RSK address not available');
			}
			throw new Error(ERROR_MESSAGES.RSK_ADDRESS_NOT_AVAILABLE);
		}

		// Fetch all ERC-20 token balances
		const tokenBalances = await tokenBalanceService.getRSKTokenBalances(address, forceRefresh);

		// Always include RBTC (even if zero) for consistency
		const rbtcBalance = await manager.rskWallet.getBalance();
		const rbtcToken: TokenBalance = {
			address: 'native',
			name: 'Smart Bitcoin',
			symbol: 'RBTC',
			decimals: 18,
			balance: rbtcBalance.balance.toString(),
			formattedBalance: rbtcBalance.formatted,
			isNative: true,
			icon: '₿'
		};

		// Combine RBTC with ERC-20 tokens
		const allTokens = [rbtcToken, ...tokenBalances];

		// Final filter: remove any tokens with zero balance (except native)
		return allTokens.filter((token) => {
			if (token.isNative) {
				return true;
			}
			const balance = BigInt(token.balance);
			return balance > 0n;
		});
	} catch (error) {
		console.error('Failed to load RSK token balances:', error);
		throw error;
	}
}

/**
 * Get balance for a specific token.
 */
export async function getTokenBalance(tokenAddress: string): Promise<TokenBalance | null> {
	try {
		const manager = getWalletManager();

		if (tokenAddress === 'native') {
			const rbtcBalance = await manager.rskWallet.getBalance();
			return {
				address: 'native',
				name: 'Rootstock Bitcoin',
				symbol: 'RBTC',
				decimals: 18,
				balance: rbtcBalance.balance.toString(),
				formattedBalance: rbtcBalance.formatted,
				isNative: true,
				icon: '₿'
			};
		}

		// Load all tokens and find the one matching the address
		const allTokens = await loadRSKTokenBalances();
		return (
			allTokens.find((token) => token.address.toLowerCase() === tokenAddress.toLowerCase()) || null
		);
	} catch (error) {
		console.error('Failed to get token balance:', error);
		return null;
	}
}
