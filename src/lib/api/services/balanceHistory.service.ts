/**
 * Historical Balance Service
 * 
 * Handles fetching and caching of historical wallet balance data for comparison periods (24h, 7d, 30d).
 * Uses block-level accuracy with API-first approach (Blockscout/BSCScan) and RPC fallback.
 * Implements daily caching strategy with localStorage persistence.
 */

import { ethers } from 'ethers';
import { RSK_NETWORKS, getBSCConfig } from '$lib/utils/wallet/networkConfig';
import cryptoPriceService from './crypto-price.service';

// Types
export interface BalanceChange {
	label: string;
	satsChange: number | null;
	usdChange: number | null;
	satsPercentChange: number | null;
	usdPercentChange: number | null;
}

interface HistoricalDataCache {
	historicalBalances: Array<number>;
	historicalPrices: Array<number | null>;
	blockNumbers: Array<number | null>;
	timestamp: number;
	expiresAt: number; // Next day boundary (00:00 UTC)
}

interface Period {
	label: string;
	hours: number;
	days: number;
}

// Constants
const LATEST_BLOCK_CACHE_TTL = 60 * 1000; // 60 seconds
const CACHE_KEY_PREFIX = 'balance_history_';

/**
 * Historical Balance Service
 * Singleton service for managing historical balance data
 */
class HistoricalBalanceService {
	// In-memory caches
	private blockNumberCache: Map<string, number | null> = new Map();
	private latestBlockCache: Map<string, { block: ethers.Block | null; timestamp: number }> = new Map();
	private historicalPricesCache: Map<string, number> = new Map();
	private bscIndexingUnavailable = true; // BSC historical data not implemented yet
	private oldCacheFormatsCleared = false; // Track if we've cleared old cache formats

	// Periods to calculate
	private readonly periods: Period[] = [
		{ label: '24h', hours: 24, days: 1 },
		{ label: '7d', hours: 24 * 7, days: 7 },
		{ label: '30d', hours: 24 * 30, days: 30 }
	];

	/**
	 * Get balance changes for all periods (24h, 7d, 30d)
	 * Main entry point for components
	 */
	async getBalanceChanges(
		currentSats: number,
		currentUsd: number,
		provider: ethers.Provider | null,
		address: string | null
	): Promise<BalanceChange[]> {
		if (!provider || !address) {
			return this.getEmptyBalanceChanges();
		}

		// Clear old cache formats on first use (one-time migration)
		// This ensures old cache formats are removed immediately
		if (!this.oldCacheFormatsCleared) {
			this.clearOldCacheFormats();
			this.oldCacheFormatsCleared = true;
		}

		const now = Date.now();
		const cacheKey = this.getCacheKey(address);
		
		// Also check and clear old format for this specific cache key
		// This handles cases where the cache key might have been created before the migration
		this.clearOldCacheFormatForKey(cacheKey);
		
		// Check cache for historical data (not calculated changes)
		let historicalBalances: Array<number> | null = null;
		let historicalPrices: Array<number | null> | null = null;
		let blockNumbers: Array<number | null> | null = null;
		
		const cachedHistoricalData = this.getCachedHistoricalData(cacheKey);
		if (cachedHistoricalData) {
			historicalBalances = cachedHistoricalData.historicalBalances;
			historicalPrices = cachedHistoricalData.historicalPrices;
			blockNumbers = cachedHistoricalData.blockNumbers;
		} else {
			// Fetch fresh historical data
			try {
				// Pre-fetch all historical data in parallel
				const prefetched = await this.prefetchHistoricalData(
					this.periods,
					now,
					provider
				);
				historicalPrices = prefetched.historicalPrices;
				blockNumbers = prefetched.blockNumbers;

				// Pre-fetch all historical balances in parallel
				historicalBalances = await this.prefetchHistoricalBalances(
					blockNumbers,
					provider,
					address
				);

				// Cache historical data (not calculated changes)
				if (historicalBalances && historicalPrices && blockNumbers) {
					this.setCachedHistoricalData(cacheKey, {
						historicalBalances,
						historicalPrices,
						blockNumbers,
						timestamp: now,
						expiresAt: this.getNextDayBoundary()
					});
				}
			} catch (error) {
				console.error('[BalanceHistoryService] Error fetching historical data:', error);
				return this.getEmptyBalanceChanges();
			}
		}

		// Validate we have the required data
		if (!historicalBalances || !historicalPrices || !blockNumbers) {
			console.error('[BalanceHistoryService] Missing required historical data');
			return this.getEmptyBalanceChanges();
		}

		// Validate array lengths match expected periods
		if (historicalBalances.length !== this.periods.length || 
		    historicalPrices.length !== this.periods.length || 
		    blockNumbers.length !== this.periods.length) {
			console.error('[BalanceHistoryService] Historical data array length mismatch');
			return this.getEmptyBalanceChanges();
		}

		// Always recalculate changes using current balance (even with cached historical data)
		try {
			const results = await Promise.all(
				this.periods.map(async (period, index) => {
					try {
						const targetTimestamp = now - period.hours * 60 * 60 * 1000;
						const historicalBalanceSats = historicalBalances[index];
						const historicalPrice = historicalPrices[index];

						if (historicalBalanceSats === undefined || historicalPrice === null) {
							return this.getEmptyBalanceChange(period.label);
						}

						return this.calculatePeriodComparison(
							period,
							historicalBalanceSats,
							historicalPrice,
							currentSats,
							currentUsd,
							targetTimestamp
						);
					} catch (error) {
						console.error(`[BalanceHistoryService] ${period.label} period error:`, error);
						return this.getEmptyBalanceChange(period.label);
					}
				})
			);

			return results;
		} catch (error) {
			console.error('[BalanceHistoryService] Error calculating balance changes:', error);
			return this.getEmptyBalanceChanges();
		}
	}

	/**
	 * Get cached latest block (cached for 60 seconds to avoid repeated calls)
	 */
	private async getCachedLatestBlock(
		provider: ethers.Provider,
		network: 'rsk' | 'bsc'
	): Promise<ethers.Block | null> {
		const cacheKey = network;
		const cached = this.latestBlockCache.get(cacheKey);
		const now = Date.now();

		// Use cache if it exists and is fresh (within TTL)
		if (cached && cached.block && now - cached.timestamp < LATEST_BLOCK_CACHE_TTL) {
			return cached.block;
		}

		// Fetch fresh block
		try {
			const block = await provider.getBlock('latest');
			if (block) {
				this.latestBlockCache.set(cacheKey, { block, timestamp: now });
				return block;
			}
		} catch (error) {
			console.warn(`[BalanceHistoryService] Failed to fetch latest block for ${network}:`, error);
		}

		return null;
	}

	/**
	 * Get block number by timestamp using Blockscout/BSCScan API (fast, single HTTP request)
	 */
	private async getBlockNumberAtTimestampViaAPI(
		targetTimestamp: number,
		network: 'rsk' | 'bsc'
	): Promise<number | null> {
		// Early exit: Skip BSC API if indexing is unavailable
		if (network === 'bsc' && this.bscIndexingUnavailable) {
			return null;
		}

		try {
			// Get network config based on environment
			const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'mainnet';
			const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'mainnet';

			let explorerApiUrl: string | null = null;
			let apiKey: string | null = null;
			let chainId: string | null = null;

			if (network === 'rsk') {
				explorerApiUrl = RSK_NETWORKS[rskNetwork as 'mainnet' | 'testnet']?.explorerApiUrl || null;
			} else if (network === 'bsc') {
				if (this.bscIndexingUnavailable) {
					return null;
				}
				const bscConfig = getBSCConfig(bscNetwork as 'mainnet' | 'testnet');
				explorerApiUrl = bscConfig.explorerApiUrl;
				chainId = String(bscConfig.chainId);
				apiKey = import.meta.env.VITE_BSCSCAN_API_KEY || null;
			}

			if (!explorerApiUrl) {
				return null;
			}

			// Convert milliseconds to seconds (Unix timestamp)
			const timestampSeconds = Math.floor(targetTimestamp / 1000);

			// Build API URL
			let apiUrl: string;
			if (network === 'rsk') {
				apiUrl = `${explorerApiUrl}?module=block&action=getblocknobytime&timestamp=${timestampSeconds}&closest=before`;
			} else {
				apiUrl = `${explorerApiUrl}?chainid=${chainId}&module=block&action=getblocknobytime&timestamp=${timestampSeconds}&closest=before`;
				if (apiKey) {
					apiUrl += `&apikey=${apiKey}`;
				}
			}

			const response = await fetch(apiUrl);

			if (!response.ok) {
				console.warn(`[BalanceHistoryService] API returned status ${response.status}`);
				return null;
			}

			const data = await response.json();

			if (data.status === '1' && data.result) {
				let blockNumberStr: string;

				// Handle different response formats
				if (typeof data.result === 'string') {
					blockNumberStr = data.result;
				} else if (
					typeof data.result === 'object' &&
					data.result !== null &&
					'blockNumber' in data.result
				) {
					blockNumberStr = String(data.result.blockNumber);
				} else {
					console.warn('[BalanceHistoryService] API returned unexpected result format:', data);
					return null;
				}

				const blockNumber = parseInt(blockNumberStr, 10);
				if (!isNaN(blockNumber) && blockNumber > 0) {
					return blockNumber;
				}
			}

			return null;
		} catch (error) {
			console.warn('[BalanceHistoryService] API failed:', error);
			return null;
		}
	}

	/**
	 * Get block number closest to a timestamp (optimized: API first, then RPC fallback)
	 */
	private async getBlockNumberAtTimestamp(
		provider: ethers.Provider,
		targetTimestamp: number,
		network: 'rsk' | 'bsc',
		providedCurrentBlockPromise?: Promise<ethers.Block | null>
	): Promise<number | null> {
		// Early exit: Skip BSC block lookup if indexing is unavailable
		if (network === 'bsc' && this.bscIndexingUnavailable) {
			return null;
		}

		// Check cache first (cache key: network_timestamp rounded to nearest hour)
		const cacheKey = `${network}_${Math.floor(targetTimestamp / (60 * 60 * 1000))}`;
		const cachedBlockNumber = this.blockNumberCache.get(cacheKey);
		if (cachedBlockNumber !== undefined) {
			return cachedBlockNumber;
		}

		// Try API first (much faster than RPC)
		const apiBlockNumber = await this.getBlockNumberAtTimestampViaAPI(targetTimestamp, network);

		if (apiBlockNumber !== null) {
			// Cache and return API result
			this.blockNumberCache.set(cacheKey, apiBlockNumber);
			return apiBlockNumber;
		}

		// API failed, check if BSC indexing became unavailable during API call
		if (network === 'bsc' && this.bscIndexingUnavailable) {
			return null;
		}

		// Fallback to RPC method if API fails
		try {
			// Get current block (use provided promise or fetch, cached for 60 seconds)
			const currentBlockToUse = providedCurrentBlockPromise
				? await providedCurrentBlockPromise
				: await this.getCachedLatestBlock(provider, network);

			if (!currentBlockToUse || !currentBlockToUse.timestamp) return null;

			const currentBlockNumber = currentBlockToUse.number;
			const currentBlockTimestamp = currentBlockToUse.timestamp * 1000;

			// If target is in the future or very recent, use latest block
			if (targetTimestamp >= currentBlockTimestamp) {
				this.blockNumberCache.set(cacheKey, currentBlockNumber);
				return currentBlockNumber;
			}

			// Calculate exact block estimate based on consistent block times
			const blockTimeSeconds = network === 'rsk' ? 30 : 3;
			const blockTimeMs = blockTimeSeconds * 1000;
			const timeDiff = currentBlockTimestamp - targetTimestamp;
			const blocksAgo = Math.floor(timeDiff / blockTimeMs);
			const estimatedBlock = Math.max(0, currentBlockNumber - blocksAgo);

			// Use estimated block (good enough for historical comparisons)
			this.blockNumberCache.set(cacheKey, estimatedBlock);
			return estimatedBlock;
		} catch (error: any) {
			// Check for BSC indexing errors
			if (
				network === 'bsc' &&
				(error?.message?.includes("state histories haven't been fully indexed") ||
					error?.code === -32000)
			) {
				console.warn('[BalanceHistoryService] BSC historical indexing not available');
				this.bscIndexingUnavailable = true;
			}
			console.error('[BalanceHistoryService] Error finding block number:', error);
			this.blockNumberCache.set(cacheKey, null);
			return null;
		}
	}

	/**
	 * Fetch historical Bitcoin price
	 */
	private async fetchHistoricalPrice(daysAgo: number): Promise<number | null> {
		try {
			const cacheKey = `btc_price_${daysAgo}d`;
			const cached = this.historicalPricesCache.get(cacheKey);
			if (cached) {
				return cached;
			}

			const price = await cryptoPriceService.getHistoricalPrice(daysAgo);

			if (price !== null) {
				this.historicalPricesCache.set(cacheKey, price);
			}

			return price;
		} catch (error) {
			console.error(`[BalanceHistoryService] Error fetching historical price for ${daysAgo}d ago:`, error);
			return null;
		}
	}

	/**
	 * Pre-fetch all historical data in parallel (blocks, prices)
	 */
	private async prefetchHistoricalData(
		periods: Period[],
		now: number,
		rskProvider: ethers.Provider | null
	): Promise<{ historicalPrices: Array<number | null>; blockNumbers: Array<number | null> }> {
		// Start latest blocks fetch (needed for RPC fallback)
		const latestBlockPromise = rskProvider ? this.getCachedLatestBlock(rskProvider, 'rsk') : null;

		// Start all historical prices fetch in parallel
		const pricePromises = periods.map((period) => this.fetchHistoricalPrice(period.days));

		// Start all block number API calls immediately
		const blockNumberPromises = periods.map((period) => {
			const targetTimestamp = now - period.hours * 60 * 60 * 1000;
			if (rskProvider) {
				return this.getBlockNumberAtTimestamp(
					rskProvider,
					targetTimestamp,
					'rsk',
					latestBlockPromise || undefined
				);
			}
			return Promise.resolve(null);
		});

		// Wait for all parallel operations to complete
		const [historicalPrices, blockNumbers] = await Promise.all([
			Promise.all(pricePromises),
			Promise.all(blockNumberPromises)
		]);

		return {
			historicalPrices,
			blockNumbers
		};
	}

	/**
	 * Pre-fetch all historical balances in parallel using pre-fetched block numbers
	 */
	private async prefetchHistoricalBalances(
		blockNumbers: Array<number | null>,
		rskProvider: ethers.Provider | null,
		rskAddress: string | null
	): Promise<Array<number>> {
		const balancePromises = blockNumbers.map((blockNumber) => {
			if (!rskProvider || !rskAddress || blockNumber === null) {
				return Promise.resolve(0);
			}
		return rskProvider
			.getBalance(rskAddress, blockNumber)
			.then((balanceWei) => {
				// Convert Wei directly to sats using integer arithmetic to avoid floating point precision issues
				// 1 RBTC = 10^18 Wei, 1 BTC = 10^8 sats
				// So: sats = (Wei * 10^8) / 10^18 = Wei / 10^10
				// balanceWei is already a bigint from ethers, so use it directly
				const satsBigInt = balanceWei / BigInt(10_000_000_000);
				return Number(satsBigInt);
			})
			.catch(() => 0);
		});

		return await Promise.all(balancePromises);
	}

	/**
	 * Calculate comparison for a single period
	 */
	private calculatePeriodComparison(
		period: Period,
		historicalBalanceSats: number,
		historicalPrice: number,
		currentSats: number,
		currentUsd: number,
		targetTimestamp: number
	): BalanceChange {
		// Calculate historical USD value using the historical BTC price at that time
		const historicalBtcAmount = historicalBalanceSats / 100_000_000;
		const historicalUsdValue = historicalBtcAmount * historicalPrice;

		// Calculate changes (current - historical)
		const satsChange = currentSats - historicalBalanceSats;
		const usdChange = currentUsd - historicalUsdValue;

		// Calculate percentage changes
		const satsPercentChange =
			historicalBalanceSats > 0
				? (satsChange / historicalBalanceSats) * 100
				: currentSats > 0
					? 100
					: 0;
		const usdPercentChange =
			historicalUsdValue > 0 ? (usdChange / historicalUsdValue) * 100 : currentUsd > 0 ? 100 : 0;

		return {
			label: period.label,
			satsChange,
			usdChange,
			satsPercentChange,
			usdPercentChange
		};
	}

	/**
	 * Get cache key for localStorage
	 */
	private getCacheKey(address: string): string {
		const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
		return `${CACHE_KEY_PREFIX}${address}_${today}`;
	}

	/**
	 * Get next day boundary (00:00 UTC) as timestamp
	 */
	private getNextDayBoundary(): number {
		const now = new Date();
		const tomorrow = new Date(now);
		tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
		tomorrow.setUTCHours(0, 0, 0, 0);
		return tomorrow.getTime();
	}

	/**
	 * Get cached historical data from localStorage
	 */
	private getCachedHistoricalData(cacheKey: string): HistoricalDataCache | null {
		try {
			const cached = localStorage.getItem(cacheKey);
			if (!cached) return null;

			const entry = JSON.parse(cached);
			const now = Date.now();

			// Check if this is the old cache format (has 'data' property with BalanceChange[])
			// If so, clear it and return null to force fresh fetch
			if (entry.data && Array.isArray(entry.data)) {
				// Check if it looks like old format (BalanceChange array)
				if (entry.data.length > 0 && entry.data[0] && typeof entry.data[0] === 'object' && 'satsChange' in entry.data[0]) {
					localStorage.removeItem(cacheKey);
					return null;
				}
			}

			// Validate new cache format - must have all required properties
			if (!entry.historicalBalances || !Array.isArray(entry.historicalBalances) ||
			    !entry.historicalPrices || !Array.isArray(entry.historicalPrices) ||
			    !entry.blockNumbers || !Array.isArray(entry.blockNumbers)) {
				localStorage.removeItem(cacheKey);
				return null;
			}

			// Validate array lengths match expected periods
			if (entry.historicalBalances.length !== this.periods.length ||
			    entry.historicalPrices.length !== this.periods.length ||
			    entry.blockNumbers.length !== this.periods.length) {
				localStorage.removeItem(cacheKey);
				return null;
			}

			// Check if cache is still valid
			if (entry.expiresAt && now < entry.expiresAt) {
				return entry as HistoricalDataCache;
			}

			// Cache expired, remove it
			localStorage.removeItem(cacheKey);
			return null;
		} catch (error) {
			console.error('[BalanceHistoryService] Error reading cache:', error);
			// Clear potentially corrupted cache
			try {
				localStorage.removeItem(cacheKey);
			} catch {
				// Ignore errors when clearing
			}
			return null;
		}
	}

	/**
	 * Set cached historical data in localStorage with daily expiration
	 */
	private setCachedHistoricalData(cacheKey: string, data: HistoricalDataCache): void {
		try {
			localStorage.setItem(cacheKey, JSON.stringify(data));
		} catch (error) {
			console.error('[BalanceHistoryService] Error writing cache:', error);
		}
	}

	/**
	 * Get empty balance change for a single period
	 */
	private getEmptyBalanceChange(label: string): BalanceChange {
		return {
			label,
			satsChange: null,
			usdChange: null,
			satsPercentChange: null,
			usdPercentChange: null
		};
	}

	/**
	 * Get empty balance changes for all periods
	 */
	private getEmptyBalanceChanges(): BalanceChange[] {
		return this.periods.map((period) => this.getEmptyBalanceChange(period.label));
	}

	/**
	 * Clear all caches (useful for testing or manual refresh)
	 */
	clearCaches(): void {
		this.blockNumberCache.clear();
		this.latestBlockCache.clear();
		this.historicalPricesCache.clear();
		
		// Clear localStorage cache
		try {
			const keys = Object.keys(localStorage);
			keys.forEach((key) => {
				if (key.startsWith(CACHE_KEY_PREFIX)) {
					localStorage.removeItem(key);
				}
			});
		} catch (error) {
			console.error('[BalanceHistoryService] Error clearing localStorage cache:', error);
		}
	}

	/**
	 * Clear old cache format for a specific cache key
	 */
	private clearOldCacheFormatForKey(cacheKey: string): void {
		try {
			const cached = localStorage.getItem(cacheKey);
			if (!cached) return;

			const entry = JSON.parse(cached);
			
			// Check if this is the old format (has 'data' property with BalanceChange[])
			if (entry.data && Array.isArray(entry.data)) {
				if (entry.data.length > 0 && entry.data[0] && typeof entry.data[0] === 'object' && 'satsChange' in entry.data[0]) {
					localStorage.removeItem(cacheKey);
				}
			}
		} catch (error) {
			// If parsing fails, remove the cache entry
			try {
				localStorage.removeItem(cacheKey);
			} catch {
				// Ignore errors when clearing
			}
		}
	}

	/**
	 * Clear old cache formats (migration helper)
	 * Call this once to migrate from old cache format to new format
	 */
	clearOldCacheFormats(): void {
		try {
			const keys = Object.keys(localStorage);
			keys.forEach((key) => {
				if (key.startsWith(CACHE_KEY_PREFIX)) {
					this.clearOldCacheFormatForKey(key);
				}
			});
		} catch (error) {
			console.error('[BalanceHistoryService] Error clearing old cache formats:', error);
		}
	}

	/**
	 * Get daily balance data for a date range
	 * Returns array of daily balances with sats and USD values
	 */
	async getDailyBalances(
		startDate: Date,
		endDate: Date,
		provider: ethers.Provider | null,
		address: string | null,
		currentSats: number = 0,
		currentUsd: number = 0
	): Promise<Array<{ date: Date; sats: number; usd: number }>> {
		if (!provider || !address) {
			return [];
		}

		const results: Array<{ date: Date; sats: number; usd: number }> = [];
		const now = Date.now();
		const endTimestamp = endDate.getTime();
		const startTimestamp = startDate.getTime();
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Calculate number of days
		const daysDiff = Math.ceil((endTimestamp - startTimestamp) / (24 * 60 * 60 * 1000));
		
		// Limit to reasonable number of days (max 365)
		const maxDays = Math.min(daysDiff, 365);

		// Get latest block for RPC fallback
		const latestBlockPromise = this.getCachedLatestBlock(provider, 'rsk');

		// Get current BTC price for today
		let currentBtcPrice: number | null = null;
		try {
			currentBtcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.warn('[BalanceHistoryService] Failed to get current BTC price, will use provided USD value');
		}

		// Fetch balances for each day
		const balancePromises: Promise<{ date: Date; sats: number; usd: number }>[] = [];
		
		for (let i = 0; i <= maxDays; i++) {
			const targetDate = new Date(startTimestamp + i * 24 * 60 * 60 * 1000);
			targetDate.setHours(0, 0, 0, 0);
			const targetTimestamp = targetDate.getTime();
			
			// Skip future dates
			if (targetTimestamp > now) {
				continue;
			}

			// Check if this is today or in the future - use current balance
			const isTodayOrFuture = targetTimestamp >= today.getTime();
			
			if (isTodayOrFuture) {
				// Use current balance for today and future dates
				const btcAmount = currentSats / 100_000_000;
				const usd = currentBtcPrice ? btcAmount * currentBtcPrice : currentUsd;
				balancePromises.push(Promise.resolve({ date: targetDate, sats: currentSats, usd }));
				continue;
			}

			// Get end of day timestamp for this date
			const endOfDayTimestamp = new Date(targetDate);
			endOfDayTimestamp.setHours(23, 59, 59, 999);
			const targetEndOfDay = endOfDayTimestamp.getTime();

			balancePromises.push(
				(async () => {
					try {
						// Get block number for this day
						const blockNumber = await this.getBlockNumberAtTimestamp(
							provider,
							targetEndOfDay,
							'rsk',
							latestBlockPromise || undefined
						);

						if (!blockNumber) {
							// If we can't get block number, return zero balance for this day
							// This ensures we still have data points for all days
							return { date: targetDate, sats: 0, usd: 0 };
						}

						// Get balance at this block
						const balanceWei = await provider.getBalance(address, blockNumber);
						const sats = Number(balanceWei / BigInt(10_000_000_000));

						// Get historical price for this day
						const daysAgo = Math.floor((now - targetEndOfDay) / (24 * 60 * 60 * 1000));
						const btcPrice = await this.fetchHistoricalPrice(daysAgo);
						
						// Calculate USD value
						const btcAmount = sats / 100_000_000;
						const usd = btcPrice ? btcAmount * btcPrice : 0;

						return { date: targetDate, sats, usd };
					} catch (error) {
						console.error(`[BalanceHistoryService] Error fetching balance for ${targetDate.toISOString()}:`, error);
						// Return zero balance instead of failing - ensures we have data points
						return { date: targetDate, sats: 0, usd: 0 };
					}
				})()
			);
		}

		// Fetch all balances in parallel (but limit concurrency to avoid overwhelming the API)
		const batchSize = 10;
		for (let i = 0; i < balancePromises.length; i += batchSize) {
			const batch = balancePromises.slice(i, i + batchSize);
			const batchResults = await Promise.all(batch);
			results.push(...batchResults);
		}

		// Sort by date
		results.sort((a, b) => a.date.getTime() - b.date.getTime());

		return results;
	}
}

// Export singleton instance
export default new HistoricalBalanceService();

