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

/**
 * Blockscout API response structure for token balances
 */
interface BlockscoutTokenBalance {
	token: {
		address: string;
		name: string;
		symbol: string;
		decimals: number;
		total_supply: string;
	};
	value: string; // Balance in smallest unit
	token_id: string | null; // For NFTs
}

/**
 * Blockscout API response structure
 */
interface BlockscoutResponse {
	items: BlockscoutTokenBalance[];
	next_page_params?: any;
}

interface CachedTokenBalances {
	balances: TokenBalance[];
	timestamp: number;
}

class TokenBalanceService {
	private tokenMetadataCache: Map<string, TokenMetadata> = new Map();
	private tokenBalanceCache: Map<string, CachedTokenBalances> = new Map();
	private readonly METADATA_CACHE_TTL = 300000; // 5 minutes
	private readonly BALANCE_CACHE_TTL = API.TOKEN_BALANCE_CACHE_TTL; // 1 minute

	/**
	 * Get explorer API URL for RSK network
	 */
	private getExplorerApiUrl(): string {
		const rskNetwork = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as 'mainnet' | 'testnet';
		return rskNetwork === 'mainnet'
			? 'https://rootstock.blockscout.com/api/v2'
			: 'https://rootstock-testnet.blockscout.com/api/v2';
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
				// Cache expired, remove it
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
				if (response.status === 404) {
					throw new Error('Address not found');
				} else if (response.status >= 500) {
					throw new Error('Blockscout API server error');
				} else {
					throw new Error(`Blockscout API error: ${response.status}`);
				}
			}

			const data: BlockscoutResponse = await response.json();

			if (!data.items || !Array.isArray(data.items)) {
				// Only log in dev mode - API may return unexpected formats
				if (import.meta.env.DEV) {
					console.warn('Invalid Blockscout API response format:', data);
				}
				return [];
			}

			// Filter out zero balance tokens
			const nonZeroTokens = data.items.filter((item: BlockscoutTokenBalance) => {
				try {
					const balance = BigInt(item.value || '0');
					return balance > 0n; // Only include tokens with balance > 0
				} catch {
					return false; // Skip invalid balance values
				}
			});

			// Process and return token balances
			const balances = await Promise.all(
				nonZeroTokens.map(item => this.processTokenBalance(item))
			);
			
			// Cache the results
			this.tokenBalanceCache.set(normalizedAddress, {
				balances,
				timestamp: Date.now()
			});
			
			return balances;
		} catch (error) {
			// If we have cached data and it's a network error, return cached data
			const cached = this.tokenBalanceCache.get(normalizedAddress);
			if (cached && error instanceof Error && (
				error.message.includes('timeout') || 
				error.message.includes('network') ||
				error.message.includes('fetch')
			)) {
				console.warn('Network error, returning cached token balances:', error.message);
				return cached.balances;
			}
			
			console.error('Failed to fetch token balances:', error);
			throw error;
		}
	}

	/**
	 * Process a token balance item from Blockscout API
	 */
	private async processTokenBalance(item: BlockscoutTokenBalance): Promise<TokenBalance> {
		const balance = BigInt(item.value || '0');
		const decimals = item.token.decimals || 18;

		// Format balance
		const formattedBalance = ethers.formatUnits(balance.toString(), decimals);

		// Cache token metadata
		const metadata: TokenMetadata = {
			address: item.token.address,
			name: item.token.name || 'Unknown Token',
			symbol: item.token.symbol || 'UNKNOWN',
			decimals: decimals,
			totalSupply: item.token.total_supply
		};
		this.tokenMetadataCache.set(item.token.address.toLowerCase(), metadata);

		return {
			address: item.token.address,
			name: metadata.name,
			symbol: metadata.symbol,
			decimals: decimals,
			balance: balance.toString(),
			formattedBalance: formattedBalance,
			isNative: false
		};
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
		this.tokenBalanceCache.delete(address.toLowerCase());
	}
}

// Export singleton instance
const tokenBalanceService = new TokenBalanceService();
export default tokenBalanceService;

