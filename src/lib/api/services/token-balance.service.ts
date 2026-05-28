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

/**
 * Blockscout API response structure
 * Can be either a direct array or an object with items property (for pagination)
 */
type BlockscoutResponse =
	| BlockscoutTokenBalance[]
	| {
			items: BlockscoutTokenBalance[];
			next_page_params?: any;
	  };

interface CachedTokenBalances {
	balances: TokenBalance[];
	timestamp: number;
}

class TokenBalanceService {
	private tokenMetadataCache: Map<string, TokenMetadata> = new Map();
	private tokenBalanceCache: Map<string, CachedTokenBalances> = new Map();
	private readonly BALANCE_CACHE_TTL = API.TOKEN_BALANCE_CACHE_TTL; // 1 minute

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
			} else {
				console.log('[TokenBalanceService] Cache miss - no cached data found', {
					address: normalizedAddress
				});
			}
		} else {
			console.log('[TokenBalanceService] Force refresh requested - bypassing cache', {
				address: normalizedAddress
			});
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
	 * Clear balance cache for a specific address
	 */
	clearBalanceCache(address: string): void {
		const normalizedAddress = address.toLowerCase();

		this.tokenBalanceCache.delete(normalizedAddress);
	}

	/**
	 * Get a token balance on Arbitrum using the RPC (erc20 balanceOf).
	 *
	 * Uses ethers provider with the hardcoded Arbitrum RPC URL.
	 * Follows the same cache TTL pattern as RSK token balances.
	 *
	 * @param address - Wallet address on Arbitrum
	 * @param tokenAddress - ERC-20 token contract address on Arbitrum
	 * @returns Token balance or null if fetch fails
	 */
	async getArbitrumTokenBalance(
		address: string,
		tokenAddress: string
	): Promise<TokenBalance | null> {
		const normalizedAddress = address.toLowerCase();
		const cacheKey = `arb:${normalizedAddress}:${tokenAddress.toLowerCase()}`;

		console.log('[TokenBalanceService] getArbitrumTokenBalance called', {
			address,
			tokenAddress,
			normalizedAddress,
			cacheKey,
			timestamp: new Date().toISOString()
		});

		// Check cache
		const cached = this.tokenBalanceCache.get(cacheKey);
		if (cached) {
			const age = Date.now() - cached.timestamp;
			if (age < this.BALANCE_CACHE_TTL) {
				console.log('[TokenBalanceService] Returning cached Arbitrum balance', {
					cacheKey,
					balance: cached.balances[0]?.formattedBalance,
					cacheAge: `${Math.floor(age / 1000)}s`
				});
				return cached.balances[0] ?? null;
			}
			this.tokenBalanceCache.delete(cacheKey);
		}

		try {
			const rpcUrl = 'https://arb1.arbitrum.io/rpc';
			const provider = new ethers.JsonRpcProvider(rpcUrl);

			// Minimal ERC-20 ABI for balanceOf, decimals, name, symbol
			const erc20Abi = [
				'function balanceOf(address) view returns (uint256)',
				'function decimals() view returns (uint8)',
				'function name() view returns (string)',
				'function symbol() view returns (string)'
			];

			const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);

			const [balance, decimals, name, symbol] = await Promise.all([
				contract.balanceOf(address).catch(() => BigInt(0)),
				contract.decimals().catch(() => 6),
				contract.name().catch(() => 'Unknown Token'),
				contract.symbol().catch(() => 'UNKNOWN')
			]);

			const formattedBalance = ethers.formatUnits(balance, Number(decimals));

			const result: TokenBalance = {
				address: tokenAddress,
				name: typeof name === 'string' ? name : 'Unknown Token',
				symbol: typeof symbol === 'string' ? symbol : 'UNKNOWN',
				decimals: Number(decimals),
				balance: balance.toString(),
				formattedBalance,
				isNative: false
			};

			// Cache result
			this.tokenBalanceCache.set(cacheKey, {
				balances: [result],
				timestamp: Date.now()
			});

			console.log('[TokenBalanceService] Arbitrum token balance fetched', {
				address,
				tokenAddress,
				symbol: result.symbol,
				balance: result.formattedBalance,
				decimals: result.decimals
			});

			return result;
		} catch (error) {
			console.error('[TokenBalanceService] Failed to fetch Arbitrum token balance', {
				address,
				tokenAddress,
				error: error instanceof Error ? error.message : String(error)
			});
			return null;
		}
	}
}

// Export singleton instance
const tokenBalanceService = new TokenBalanceService();
export default tokenBalanceService;
