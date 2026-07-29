/**
 * Token Balance Service
 *
 * Fetches all token balances from Blockscout API for Rootstock network.
 * Automatically filters out tokens with zero balance.
 * Includes caching to reduce API calls.
 */

import { ethers } from 'ethers';
import type { TokenBalance, TokenMetadata } from '$lib/types/wallet';
import { API } from '$lib/utils/constants/wallet.constants';
import { getBlockscoutApiUrl } from '$lib/utils/wallet/explorerProxy';

/**
 * Blockscout API response structure for token balances
 * Matches actual Blockscout API response format
 */
interface BlockscoutTokenBalance {
	token: {
		address_hash: string; // API returns address_hash, not address
		name: string;
		symbol: string;
		decimals: string; // API returns decimals as string
		total_supply?: string; // Optional, may not be present
		icon_url?: string | null;
		circulating_market_cap?: string;
		exchange_rate?: string;
		holders_count?: string;
		reputation?: string;
		type?: string;
		volume_24h?: string;
	};
	value: string; // Balance in smallest unit
	token_id: string | null; // For NFTs
	token_instance: string | null; // May be present in response
}

interface CachedTokenBalances {
	balances: TokenBalance[];
	timestamp: number;
}

class TokenBalanceService {
	private tokenMetadataCache: Map<string, TokenMetadata> = new Map();
	private tokenBalanceCache: Map<string, CachedTokenBalances> = new Map();
	private readonly BALANCE_CACHE_TTL = API.TOKEN_BALANCE_CACHE_TTL; // 1 minute

	/** Cache key prefix for native RBTC balance */
	private static readonly RSK_NATIVE_PREFIX = 'rsk-native:';

	/**
	 * Get explorer API URL for RSK network
	 */
	private getExplorerApiUrl(): string {
		return getBlockscoutApiUrl();
	}

	/**
	 * Fetch all token balances for an address from Blockscout API
	 * Automatically filters out tokens with zero balance
	 * Uses caching to reduce API calls
	 *
	 * @param address - RSK wallet address
	 * @param forceRefresh - Force refresh even if cache is valid
	 * @returns Array of token balances (non-zero only)
	 */
	async getRSKTokenBalances(address: string, forceRefresh = false): Promise<TokenBalance[]> {
		const normalizedAddress = address.toLowerCase();

		// Check cache first
		if (!forceRefresh) {
			const cached = this.tokenBalanceCache.get(normalizedAddress);
			if (cached) {
				const age = Date.now() - cached.timestamp;

				if (age < this.BALANCE_CACHE_TTL) {
					return cached.balances;
				}

				this.tokenBalanceCache.delete(normalizedAddress);
			}
		}

		try {
			const apiUrl = this.getExplorerApiUrl();
			const url = `${apiUrl}/addresses/${address}/token-balances`;

			const response = await fetch(url, {
				signal: AbortSignal.timeout(API.BLOCKSCOUT_TIMEOUT)
			});

			if (!response.ok) {
				// Distinguish between different error types
				let errorMessage: string;
				if (response.status === 404) {
					errorMessage = 'Address not found';
				} else if (response.status >= 500) {
					errorMessage = 'Blockscout API server error';
				} else {
					errorMessage = `Blockscout API error: ${response.status}`;
				}

				throw new Error(errorMessage);
			}

			const data = await response.json();

			// Handle both array response and paginated response
			let items: BlockscoutTokenBalance[];
			if (Array.isArray(data)) {
				items = data;
			} else if (data.items && Array.isArray(data.items)) {
				items = data.items;
			} else {
				return [];
			}

			// Filter out zero balance tokens
			const zeroBalanceTokens: Array<{ symbol: string; address: string; value: string }> = [];
			const invalidBalanceTokens: Array<{
				symbol: string;
				address: string;
				value: string;
				error: string;
			}> = [];

			const nonZeroTokens = items.filter((item: BlockscoutTokenBalance) => {
				try {
					const balance = BigInt(item.value || '0');
					const isNonZero = balance > 0n;

					if (!isNonZero) {
						zeroBalanceTokens.push({
							symbol: item.token?.symbol || 'UNKNOWN',
							address: item.token?.address_hash || 'UNKNOWN',
							value: item.value || '0'
						});
					}

					return isNonZero; // Only include tokens with balance > 0
				} catch (error) {
					// Skip invalid balance values
					invalidBalanceTokens.push({
						symbol: item.token?.symbol || 'UNKNOWN',
						address: item.token?.address_hash || 'UNKNOWN',
						value: item.value || 'INVALID',
						error: error instanceof Error ? error.message : String(error)
					});
					return false;
				}
			});

			const balances = await Promise.all(
				nonZeroTokens.map((item) => {
					return this.processTokenBalance(item);
				})
			);

			// Cache the results
			const cacheTimestamp = Date.now();
			this.tokenBalanceCache.set(normalizedAddress, {
				balances,
				timestamp: cacheTimestamp
			});

			return balances;
		} catch (error) {
			// If we have cached data and it's a network error, return cached data
			const cached = this.tokenBalanceCache.get(normalizedAddress);
			if (
				cached &&
				error instanceof Error &&
				(error.message.includes('timeout') ||
					error.message.includes('network') ||
					error.message.includes('fetch'))
			) {
				return cached.balances;
			}

			throw error;
		}
	}

	/**
	 * Process a token balance item from Blockscout API
	 */
	private async processTokenBalance(item: BlockscoutTokenBalance): Promise<TokenBalance> {
		const tokenAddress = item.token.address_hash;
		const balance = BigInt(item.value || '0');

		// Parse decimals from string to number (API returns as string)
		const decimalsString = item.token.decimals || '18';
		const decimals = parseInt(decimalsString, 10);

		// Format balance
		const formattedBalance = ethers.formatUnits(balance.toString(), decimals);

		// Cache token metadata
		const metadata: TokenMetadata = {
			address: tokenAddress,
			name: item.token.name || 'Unknown Token',
			symbol: item.token.symbol || 'UNKNOWN',
			decimals: decimals,
			totalSupply: item.token.total_supply
		};

		const metadataCacheKey = tokenAddress.toLowerCase();
		this.tokenMetadataCache.set(metadataCacheKey, metadata);

		const result: TokenBalance = {
			address: tokenAddress,
			name: metadata.name,
			symbol: metadata.symbol,
			decimals: decimals,
			balance: balance.toString(),
			formattedBalance: formattedBalance,
			isNative: false,
			icon: item.token.icon_url || undefined // Use 'icon' to match TokenBalance type
		};

		return result;
	}

	/**
	 * Get token metadata (cached if available)
	 *
	 * @param tokenAddress - Token contract address
	 * @returns Token metadata or null if not found
	 */
	getTokenMetadata(tokenAddress: string): TokenMetadata | null {
		return this.tokenMetadataCache.get(tokenAddress.toLowerCase()) || null;
	}

	/**
	 * Clear all caches (metadata and balances)
	 */
	clearCache(): void {
		this.tokenMetadataCache.clear();
		this.tokenBalanceCache.clear();
	}

	/**
	 * Fetch a single ERC-20 token balance on Arbitrum via direct RPC call.
	 * Supports caching (same TTL as RSK token balances) and forceRefresh.
	 *
	 * @param address - Wallet address to query
	 * @param tokenAddress - ERC-20 contract address on Arbitrum
	 * @param decimals - Token decimals (fetched from contract if omitted)
	 * @param forceRefresh - Bypass cache and fetch fresh from chain
	 * @returns Balance object or null if zero / error
	 */
	async getArbitrumTokenBalance(
		address: string,
		tokenAddress: string,
		decimals?: number,
		forceRefresh = false
	): Promise<{ balance: string; formattedBalance: string } | null> {
		const normalizedAddress = address.toLowerCase();
		const cacheKey = `arb:${normalizedAddress}:${tokenAddress.toLowerCase()}`;

		// Check cache (skip if forceRefresh)
		if (!forceRefresh) {
			const cached = this.tokenBalanceCache.get(cacheKey);
			if (cached) {
				const age = Date.now() - cached.timestamp;
				if (age < this.BALANCE_CACHE_TTL) {
					console.log('[TokenBalanceService] Returning cached Arbitrum balance', {
						cacheKey,
						balance: cached.balances[0]?.formattedBalance,
						cacheAge: `${Math.floor(age / 1000)}s`
					});
					return cached.balances[0]
						? {
								balance: cached.balances[0].balance,
								formattedBalance: cached.balances[0].formattedBalance
							}
						: null;
				}
				this.tokenBalanceCache.delete(cacheKey);
			}
		} else {
			this.tokenBalanceCache.delete(cacheKey);
		}

		try {
			const rpcUrl =
				(import.meta.env.VITE_ARBITRUM_RPC_URL as string) || 'https://arb1.arbitrum.io/rpc';
			const balanceOfData =
				'0x70a08231' + '000000000000000000000000' + address.toLowerCase().slice(2);

			let dec = decimals;
			const calls: Promise<Response>[] = [
				fetch(rpcUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						method: 'eth_call',
						params: [{ to: tokenAddress, data: balanceOfData }, 'latest'],
						id: 1
					}),
					signal: AbortSignal.timeout(10_000)
				})
			];

			if (dec === undefined) {
				calls.push(
					fetch(rpcUrl, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							jsonrpc: '2.0',
							method: 'eth_call',
							params: [{ to: tokenAddress, data: '0x313ce567' }, 'latest'],
							id: 2
						}),
						signal: AbortSignal.timeout(10_000)
					})
				);
			}

			const responses = await Promise.all(calls);
			const balanceJson = await responses[0].json();
			const hexBalance = balanceJson.result;
			if (!hexBalance || hexBalance === '0x') return null;

			const raw = BigInt(hexBalance);
			if (raw === 0n) return null;

			if (dec === undefined && responses[1]) {
				const decimalsJson = await responses[1].json();
				dec = decimalsJson.result ? parseInt(decimalsJson.result, 16) : 18;
			}
			dec ??= 18;

			const formattedBalance = ethers.formatUnits(raw.toString(), dec);
			const result = { balance: raw.toString(), formattedBalance };

			// Cache the result
			this.tokenBalanceCache.set(cacheKey, {
				balances: [
					{ address: tokenAddress, name: '', symbol: '', decimals: dec, ...result, isNative: false }
				],
				timestamp: Date.now()
			});

			return result;
		} catch (e) {
			console.warn('[TokenBalanceService] getArbitrumTokenBalance failed:', e);
			return null;
		}
	}

	/**
	 * Fetch native RBTC balance via direct RPC call (eth_getBalance).
	 * This method uses tokenBalanceService's cache system, ensuring that
	 * clearAllBalanceCaches() can force a fresh native balance fetch.
	 *
	 * This fixes the balance double-counting bug during cross-chain bridges:
	 * manager.rskWallet.getBalance() uses the SDK's internal cache which
	 * clearAllBalanceCaches() cannot clear. When a bridge delivers WBTC on
	 * Arbitrum while the SDK returns a stale RBTC balance, the total shows
	 * both the old RBTC AND new WBTC = 2× the correct value.
	 *
	 * @param address - RSK wallet address
	 * @param rpcUrl - RSK RPC URL (e.g., 'https://public-node.rsk.co')
	 * @param forceRefresh - Force refresh even if cache is valid
	 * @returns Native RBTC balance info, or null on error
	 */
	async getRSKNativeBalance(
		address: string,
		rpcUrl: string,
		forceRefresh = false
	): Promise<{ balance: bigint; formatted: string } | null> {
		const cacheKey = `${TokenBalanceService.RSK_NATIVE_PREFIX}${address.toLowerCase()}`;

		// Check cache
		if (!forceRefresh) {
			const cached = this.tokenBalanceCache.get(cacheKey);
			if (cached && Date.now() - cached.timestamp < this.BALANCE_CACHE_TTL) {
				const b = cached.balances[0];
				if (b) return { balance: BigInt(b.balance), formatted: b.formattedBalance };
			}
		}

		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_getBalance',
					params: [address, 'latest'],
					id: 1
				}),
				signal: AbortSignal.timeout(10_000)
			});
			const data = (await response.json()) as { result?: string; error?: { message: string } };
			if (data.error || !data.result) return null;

			const balance = BigInt(data.result);
			const formatted = (Number(balance) / 1e18).toFixed(8);

			// Cache the result so clearAllBalanceCaches can clear it
			this.tokenBalanceCache.set(cacheKey, {
				balances: [{
					address: '0x0000000000000000000000000000000000000000',
					name: 'Rootstock Bitcoin',
					symbol: 'RBTC',
					decimals: 18,
					balance: balance.toString(),
					formattedBalance: formatted,
					isNative: true
				}],
				timestamp: Date.now()
			});

			return { balance, formatted };
		} catch (e) {
			console.warn('[TokenBalanceService] getRSKNativeBalance failed:', e);
			return null;
		}
	}

	/**
	 * Clear balance cache for a specific address (RSK only).
	 */
	clearBalanceCache(address: string): void {
		const normalizedAddress = address.toLowerCase();
		this.tokenBalanceCache.delete(normalizedAddress);
	}

	/**
	 * Clear ALL balance caches for an address across all chains.
	 * Must be called after any token transfer (swap, bridge, send) to ensure
	 * the UI doesn't show stale balances.
	 */
	clearAllBalanceCaches(address: string): void {
		const normalizedAddress = address.toLowerCase();
		// Clear RSK ERC-20 cache
		this.tokenBalanceCache.delete(normalizedAddress);
		// Clear native RBTC cache (fixes double-counting during cross-chain bridges)
		this.tokenBalanceCache.delete(`${TokenBalanceService.RSK_NATIVE_PREFIX}${normalizedAddress}`);
		// Clear all Arbitrum caches (keys are arb:{addr}:{token})
		for (const key of this.tokenBalanceCache.keys()) {
			if (key.startsWith(`arb:${normalizedAddress}:`)) {
				this.tokenBalanceCache.delete(key);
			}
		}
	}

	/**
	 * Get any ERC-20 token balance on any EVM chain with a given RPC URL.
	 */
	async getEVMTokenBalance(
		address: string,
		tokenAddress: string,
		decimals: number,
		rpcUrl: string,
		symbol: string,
		name: string
	): Promise<TokenBalance | null> {
		console.log('[TokenService] getEVMTokenBalance:', {
			symbol,
			address: address.slice(0, 10) + '...',
			chain: new URL(rpcUrl).hostname
		});
		const cacheKey = `evm:${rpcUrl}:${address.toLowerCase()}:${tokenAddress.toLowerCase()}`;
		const cached = this.tokenBalanceCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.BALANCE_CACHE_TTL) {
			return cached.balances[0] ?? null;
		}
		try {
			const balanceOfSelector =
				'0x70a08231' + address.toLowerCase().replace('0x', '').padStart(64, '0');
			const resp = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_call',
					params: [{ to: tokenAddress, data: balanceOfSelector }, 'latest'],
					id: 1
				})
			});
			const data = (await resp.json()) as { result: string };
			const balance = BigInt(data.result || '0x0');
			console.log('[TokenService] getEVMTokenBalance result:', {
				symbol,
				balance: balance.toString()
			});
			if (balance === 0n) return null;
			const formattedBalance = (Number(balance) / Math.pow(10, decimals)).toFixed(
				decimals > 6 ? 6 : decimals
			);
			const result: TokenBalance = {
				address: tokenAddress,
				name,
				symbol,
				decimals,
				balance: balance.toString(),
				formattedBalance,
				isNative: false
			};
			this.tokenBalanceCache.set(cacheKey, { balances: [result], timestamp: Date.now() });
			return result;
		} catch (e) {
			console.warn('[TokenBalanceService] EVM token balance fetch failed:', e);
			return null;
		}
	}
}

const tokenBalanceService = new TokenBalanceService();
export default tokenBalanceService;
