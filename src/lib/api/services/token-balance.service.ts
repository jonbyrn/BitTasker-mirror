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
	token_instance: any | null; // May be present in response
}

/**
 * Blockscout API response structure
 * Can be either a direct array or an object with items property (for pagination)
 */
type BlockscoutResponse = BlockscoutTokenBalance[] | {
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
		const startTime = Date.now();
		
		console.log('[TokenBalanceService] getRSKTokenBalances called', {
			address,
			normalizedAddress,
			forceRefresh,
			timestamp: new Date().toISOString()
		});
		
		// Check cache first
		if (!forceRefresh) {
			const cached = this.tokenBalanceCache.get(normalizedAddress);
			if (cached) {
				const age = Date.now() - cached.timestamp;
				const ageSeconds = Math.floor(age / 1000);
				const ttlSeconds = Math.floor(this.BALANCE_CACHE_TTL / 1000);
				
				console.log('[TokenBalanceService] Cache check', {
					address: normalizedAddress,
					cacheAge: `${ageSeconds}s`,
					cacheTTL: `${ttlSeconds}s`,
					tokenCount: cached.balances.length,
					cachedTokens: cached.balances.map(t => ({ symbol: t.symbol, address: t.address, balance: t.formattedBalance }))
				});
				
				if (age < this.BALANCE_CACHE_TTL) {
					console.log('[TokenBalanceService] Cache hit - returning cached balances', {
						address: normalizedAddress,
						tokenCount: cached.balances.length,
						elapsed: `${Date.now() - startTime}ms`
					});
					return cached.balances;
				}
				
				// Cache expired, remove it
				console.log('[TokenBalanceService] Cache expired - removing and fetching fresh data', {
					address: normalizedAddress,
					cacheAge: `${ageSeconds}s`,
					cacheTTL: `${ttlSeconds}s`
				});
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
			const rskNetwork = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as 'mainnet' | 'testnet';
			const url = `${apiUrl}/addresses/${address}/token-balances`;

			console.log('[TokenBalanceService] Fetching token balances from Blockscout API', {
				address,
				network: rskNetwork,
				apiUrl,
				url,
				timeout: `${API.BLOCKSCOUT_TIMEOUT}ms`,
				timestamp: new Date().toISOString()
			});

			const fetchStartTime = Date.now();
			const response = await fetch(url, {
				signal: AbortSignal.timeout(API.BLOCKSCOUT_TIMEOUT)
			});
			const fetchDuration = Date.now() - fetchStartTime;

			console.log('[TokenBalanceService] API response received', {
				address,
				status: response.status,
				statusText: response.statusText,
				ok: response.ok,
				headers: Object.fromEntries(response.headers.entries()),
				fetchDuration: `${fetchDuration}ms`,
				timestamp: new Date().toISOString()
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
				
				console.error('[TokenBalanceService] API error response', {
					address,
					url,
					status: response.status,
					statusText: response.statusText,
					errorMessage,
					fetchDuration: `${fetchDuration}ms`
				});
				
				throw new Error(errorMessage);
			}

			const parseStartTime = Date.now();
			const data = await response.json();
			const parseDuration = Date.now() - parseStartTime;

			console.log('[TokenBalanceService] API response parsed', {
				address,
				responseType: Array.isArray(data) ? 'array' : typeof data,
				isArray: Array.isArray(data),
				hasItems: !Array.isArray(data) && 'items' in data,
				itemCount: Array.isArray(data) ? data.length : (data.items ? data.items.length : 0),
				parseDuration: `${parseDuration}ms`,
				rawResponseStructure: Array.isArray(data) 
					? 'direct array' 
					: (data.items ? 'paginated object' : 'unknown'),
				timestamp: new Date().toISOString()
			});

			// Handle both array response and paginated response
			let items: BlockscoutTokenBalance[];
			if (Array.isArray(data)) {
				// API returns array directly: [{...}]
				console.log('[TokenBalanceService] Processing direct array response', {
					address,
					tokenCount: data.length,
					firstToken: data[0] ? {
						address_hash: data[0].token?.address_hash,
						symbol: data[0].token?.symbol,
						name: data[0].token?.name,
						value: data[0].value
					} : null
				});
				items = data;
			} else if (data.items && Array.isArray(data.items)) {
				// API returns paginated response: { items: [...] }
				console.log('[TokenBalanceService] Processing paginated response', {
					address,
					tokenCount: data.items.length,
					hasNextPage: !!data.next_page_params,
					nextPageParams: data.next_page_params,
					firstToken: data.items[0] ? {
						address_hash: data.items[0].token?.address_hash,
						symbol: data.items[0].token?.symbol,
						name: data.items[0].token?.name,
						value: data.items[0].value
					} : null
				});
				items = data.items;
			} else {
				// Invalid format
				console.warn('[TokenBalanceService] Invalid Blockscout API response format', {
					address,
					url,
					responseType: typeof data,
					isArray: Array.isArray(data),
					hasItems: 'items' in data,
					responseKeys: Object.keys(data),
					rawData: data
				});
				return [];
			}

			console.log('[TokenBalanceService] Raw token items from API', {
				address,
				totalItems: items.length,
				items: items.map((item, index) => ({
					index,
					address_hash: item.token?.address_hash,
					symbol: item.token?.symbol,
					name: item.token?.name,
					decimals: item.token?.decimals,
					value: item.value,
					hasTokenId: !!item.token_id,
					hasTokenInstance: !!item.token_instance
				}))
			});

			// Filter out zero balance tokens
			const filterStartTime = Date.now();
			const zeroBalanceTokens: Array<{ symbol: string; address: string; value: string }> = [];
			const invalidBalanceTokens: Array<{ symbol: string; address: string; value: string; error: string }> = [];
			
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
			const filterDuration = Date.now() - filterStartTime;

			console.log('[TokenBalanceService] Token filtering results', {
				address,
				totalTokens: items.length,
				nonZeroTokens: nonZeroTokens.length,
				zeroBalanceTokens: zeroBalanceTokens.length,
				invalidBalanceTokens: invalidBalanceTokens.length,
				filterDuration: `${filterDuration}ms`,
				zeroBalanceDetails: zeroBalanceTokens.length > 0 ? zeroBalanceTokens : undefined,
				invalidBalanceDetails: invalidBalanceTokens.length > 0 ? invalidBalanceTokens : undefined
			});

			// Process and return token balances
			const processStartTime = Date.now();
			console.log('[TokenBalanceService] Processing token balances', {
				address,
				tokenCount: nonZeroTokens.length,
				tokens: nonZeroTokens.map(item => ({
					address_hash: item.token?.address_hash,
					symbol: item.token?.symbol,
					name: item.token?.name,
					decimals: item.token?.decimals,
					value: item.value
				}))
			});
			
			const balances = await Promise.all(
				nonZeroTokens.map((item, index) => {
					console.log('[TokenBalanceService] Processing token', {
						address,
						index: index + 1,
						total: nonZeroTokens.length,
						tokenAddress: item.token?.address_hash,
						symbol: item.token?.symbol,
						name: item.token?.name,
						decimals: item.token?.decimals,
						rawValue: item.value
					});
					return this.processTokenBalance(item);
				})
			);
			const processDuration = Date.now() - processStartTime;
			
			// Cache the results
			const cacheTimestamp = Date.now();
			this.tokenBalanceCache.set(normalizedAddress, {
				balances,
				timestamp: cacheTimestamp
			});
			
			const totalDuration = Date.now() - startTime;
			
			console.log('[TokenBalanceService] Token balances processed and cached', {
				address,
				normalizedAddress,
				tokenCount: balances.length,
				processDuration: `${processDuration}ms`,
				totalDuration: `${totalDuration}ms`,
				cachedAt: new Date(cacheTimestamp).toISOString(),
				finalBalances: balances.map(b => ({
					address: b.address,
					symbol: b.symbol,
					name: b.name,
					decimals: b.decimals,
					balance: b.balance,
					formattedBalance: b.formattedBalance,
					hasIcon: !!b.icon
				}))
			});
			
			return balances;
		} catch (error) {
			const errorDuration = Date.now() - startTime;
			
			// If we have cached data and it's a network error, return cached data
			const cached = this.tokenBalanceCache.get(normalizedAddress);
			if (cached && error instanceof Error && (
				error.message.includes('timeout') || 
				error.message.includes('network') ||
				error.message.includes('fetch')
			)) {
				console.warn('[TokenBalanceService] Network error - returning cached token balances', {
					address,
					normalizedAddress,
					error: error.message,
					errorType: error.constructor.name,
					errorStack: error.stack,
					cachedTokenCount: cached.balances.length,
					cacheAge: `${Math.floor((Date.now() - cached.timestamp) / 1000)}s`,
					errorDuration: `${errorDuration}ms`
				});
				return cached.balances;
			}
			
			console.error('[TokenBalanceService] Failed to fetch token balances', {
				address,
				normalizedAddress,
				error: error instanceof Error ? error.message : String(error),
				errorType: error instanceof Error ? error.constructor.name : typeof error,
				errorStack: error instanceof Error ? error.stack : undefined,
				errorDuration: `${errorDuration}ms`,
				timestamp: new Date().toISOString()
			});
			throw error;
		}
	}

	/**
	 * Process a token balance item from Blockscout API
	 */
	private async processTokenBalance(item: BlockscoutTokenBalance): Promise<TokenBalance> {
		const processStartTime = Date.now();
		const tokenAddress = item.token.address_hash;
		
		console.log('[TokenBalanceService] processTokenBalance started', {
			tokenAddress,
			rawItem: {
				address_hash: item.token.address_hash,
				name: item.token.name,
				symbol: item.token.symbol,
				decimals: item.token.decimals,
				total_supply: item.token.total_supply,
				icon_url: item.token.icon_url,
				value: item.value,
				token_id: item.token_id,
				hasTokenInstance: !!item.token_instance
			}
		});
		
		try {
			const balance = BigInt(item.value || '0');
			
			// Parse decimals from string to number (API returns as string)
			const decimalsString = item.token.decimals || '18';
			const decimals = parseInt(decimalsString, 10);
			
			if (isNaN(decimals)) {
				console.warn('[TokenBalanceService] Invalid decimals value', {
					tokenAddress,
					decimalsString,
					fallback: 18
				});
			}

			// Format balance
			const formattedBalance = ethers.formatUnits(balance.toString(), decimals);

			console.log('[TokenBalanceService] Token balance parsed', {
				tokenAddress,
				rawValue: item.value,
				balance: balance.toString(),
				decimals,
				decimalsString,
				formattedBalance
			});

			// Cache token metadata
			const metadata: TokenMetadata = {
				address: tokenAddress,
				name: item.token.name || 'Unknown Token',
				symbol: item.token.symbol || 'UNKNOWN',
				decimals: decimals,
				totalSupply: item.token.total_supply
			};
			
			const metadataCacheKey = tokenAddress.toLowerCase();
			const hadExistingMetadata = this.tokenMetadataCache.has(metadataCacheKey);
			this.tokenMetadataCache.set(metadataCacheKey, metadata);

			console.log('[TokenBalanceService] Token metadata cached', {
				tokenAddress,
				metadataCacheKey,
				hadExistingMetadata,
				metadata: {
					address: metadata.address,
					name: metadata.name,
					symbol: metadata.symbol,
					decimals: metadata.decimals,
					totalSupply: metadata.totalSupply
				}
			});

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
			
			const processDuration = Date.now() - processStartTime;
			
			console.log('[TokenBalanceService] processTokenBalance completed', {
				tokenAddress,
				result: {
					address: result.address,
					symbol: result.symbol,
					name: result.name,
					decimals: result.decimals,
					balance: result.balance,
					formattedBalance: result.formattedBalance,
					hasIcon: !!result.icon
				},
				processDuration: `${processDuration}ms`
			});
			
			return result;
		} catch (error) {
			const processDuration = Date.now() - processStartTime;
			
			console.error('[TokenBalanceService] Error processing token balance', {
				tokenAddress,
				rawItem: {
					address_hash: item.token.address_hash,
					symbol: item.token.symbol,
					name: item.token.name,
					decimals: item.token.decimals,
					value: item.value
				},
				error: error instanceof Error ? error.message : String(error),
				errorType: error instanceof Error ? error.constructor.name : typeof error,
				errorStack: error instanceof Error ? error.stack : undefined,
				processDuration: `${processDuration}ms`
			});
			
			throw error;
		}
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
		const metadataCount = this.tokenMetadataCache.size;
		const balanceCount = this.tokenBalanceCache.size;
		
		console.log('[TokenBalanceService] clearCache called', {
			metadataCacheSize: metadataCount,
			balanceCacheSize: balanceCount,
			cachedAddresses: Array.from(this.tokenBalanceCache.keys())
		});
		
		this.tokenMetadataCache.clear();
		this.tokenBalanceCache.clear();
		
		console.log('[TokenBalanceService] Cache cleared', {
			metadataCleared: metadataCount,
			balanceCleared: balanceCount
		});
	}
	
	/**
	 * Clear balance cache for a specific address
	 */
	clearBalanceCache(address: string): void {
		const normalizedAddress = address.toLowerCase();
		const hadCache = this.tokenBalanceCache.has(normalizedAddress);
		
		console.log('[TokenBalanceService] clearBalanceCache called', {
			address,
			normalizedAddress,
			hadCache,
			cachedTokenCount: hadCache ? this.tokenBalanceCache.get(normalizedAddress)?.balances.length : 0
		});
		
		this.tokenBalanceCache.delete(normalizedAddress);
		
		console.log('[TokenBalanceService] Balance cache cleared for address', {
			address,
			normalizedAddress,
			wasCached: hadCache
		});
	}
}

// Export singleton instance
const tokenBalanceService = new TokenBalanceService();
export default tokenBalanceService;

