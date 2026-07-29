/**
 * Historical Balance Service
 *
 * Handles fetching and caching of historical wallet balance data for comparison periods (24h, 7d, 30d).
 * Uses block-level accuracy with API-first approach (Blockscout for RSK, free Binance RPC for BSC) and RPC fallback.
 * Implements daily caching strategy with Capacitor Preferences persistence.
 */

import { ethers } from 'ethers';
import { RSK_NETWORKS, getBSCConfig } from '@bittasker/wallet-core';
import cryptoPriceService from './crypto-price.service';
import { Preferences } from '@capacitor/preferences';

// RSK ERC20 token addresses for stablecoin balance lookups
const USDT_RSK = '0x779Ded0c9e1022225f8E0630b35a9b54bE713736';
const DOC_RSK = '0xe700691dA7b9851F2F35f8b8182c69c53CcaD9Db';

// Arbitrum token contract addresses
const USDT0_ARB = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'; // 6 decimals
const WBTC_ARB = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'; // 8 decimals
const ARBITRUM_RPC = 'https://arb1.arbitrum.io/rpc';
const ARBITRUM_BLOCK_TIME_MS = 250; // ~250ms per block

// ERC20 balanceOf ABI
const erc20Interface = new ethers.Interface(['function balanceOf(address) view returns (uint256)']);

// Track if we've already logged the non-archive RPC warning (avoid console spam)
let _stablecoinFetchWarningLogged = false;

/**
 * Fetch USDT (6 decimals) and DOC (18 decimals) balances at a historical block.
 * Returns their combined USD-equivalent value (both are ~$1 stablecoins).
 */
async function fetchStablecoinUsdAtBlock(
	provider: ethers.Provider,
	address: string,
	blockNumber: number
): Promise<number> {
	const hexBlock = '0x' + blockNumber.toString(16);
	const rpcUrl = getRpcUrl(provider);

	try {
		// Direct eth_call via RPC fetch (bypasses ethers v6 address validation)
		const [usdtHex, docHex] = await Promise.all([
			fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_call',
					params: [
						{
							to: USDT_RSK,
							data: erc20Interface.encodeFunctionData('balanceOf', [address])
						},
						hexBlock
					],
					id: 1
				})
			}).then((r) => r.json()),
			fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_call',
					params: [
						{
							to: DOC_RSK,
							data: erc20Interface.encodeFunctionData('balanceOf', [address])
						},
						hexBlock
					],
					id: 2
				})
			}).then((r) => r.json())
		]);

		// USDT is 6 decimals, DOC is 18 decimals — both are ~$1 stablecoins
		const usdtBalance =
			usdtHex?.result && usdtHex.result !== '0x'
				? parseFloat(ethers.formatUnits(usdtHex.result, 6))
				: 0;
		const docBalance =
			docHex?.result && docHex.result !== '0x'
				? parseFloat(ethers.formatUnits(docHex.result, 18))
				: 0;

		return usdtBalance + docBalance;
	} catch {
		if (!_stablecoinFetchWarningLogged) {
			console.warn(
				'[BalanceHistoryService] Failed to fetch stablecoin balances (non-archive RPC). Subsequent failures silenced.'
			);
			_stablecoinFetchWarningLogged = true;
		}
		return 0; // If historical call fails (non-archive node), stablecoins are assumed 0
	}
}

/**
 * Batch-fetch historical USDT0 and wBTC (Arbitrum) balances for multiple days.
 *
 * Strategy: fetch latest Arbitrum block once, estimate daily block numbers
 * from it (Arbitrum ~250ms blocks), then batch all `eth_call` requests
 * into a single JSON-RPC batch call. Total: 2 HTTP requests for any
 * number of days × 2 tokens.
 *
 * @param address - The wallet address to query
 * @param endOfDayTimestamps - Array of end-of-day timestamps (ms) to fetch balances for
 * @returns Object with usdt0 (USD value) and wbtcSats (sats equivalent) Maps
 */
async function fetchArbitrumTokensBatch(
	address: string,
	endOfDayTimestamps: number[]
): Promise<{ usdt0Map: Map<number, number>; wbtcSatsMap: Map<number, number> }> {
	const usdt0Map = new Map<number, number>();
	const wbtcSatsMap = new Map<number, number>();
	if (endOfDayTimestamps.length === 0) return { usdt0Map, wbtcSatsMap };

	try {
		// Step 1: Fetch latest Arbitrum block (1 RPC call)
		const latestResponse = await fetchWithTimeout(ARBITRUM_RPC, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'eth_getBlockByNumber',
				params: ['latest', false],
				id: 1
			})
		});

		if (!latestResponse.ok) {
			console.warn('[BalanceHistoryService] Arbitrum RPC returned status', latestResponse.status);
			return { usdt0Map, wbtcSatsMap };
		}

		const latestData = await latestResponse.json();
		if (!latestData.result) return { usdt0Map, wbtcSatsMap };

		const latestBlockNumber = parseInt(latestData.result.number, 16);
		const latestTimestamp = parseInt(latestData.result.timestamp, 16) * 1000; // ms

		// Step 2: Estimate block numbers for each day (pure math)
		const estimatedBlocks = endOfDayTimestamps.map((targetTs) => {
			if (targetTs >= latestTimestamp) return latestBlockNumber;
			const timeDiffMs = latestTimestamp - targetTs;
			const blocksAgo = Math.floor(timeDiffMs / ARBITRUM_BLOCK_TIME_MS);
			return Math.max(0, latestBlockNumber - blocksAgo);
		});

		// Step 3: Build JSON-RPC batch — 2 eth_call per day (USDT0 + wBTC)
		const balanceOfData = erc20Interface.encodeFunctionData('balanceOf', [address]);

		const batchRequest: Array<{ jsonrpc: string; method: string; params: unknown[]; id: number }> =
			[];
		for (let i = 0; i < estimatedBlocks.length; i++) {
			const hexBlock = '0x' + estimatedBlocks[i].toString(16);
			// USDT0 call (id: i+1)
			batchRequest.push({
				jsonrpc: '2.0',
				method: 'eth_call',
				params: [{ to: USDT0_ARB, data: balanceOfData }, hexBlock],
				id: i + 1
			});
			// wBTC call (id: i+1 + offset)
			batchRequest.push({
				jsonrpc: '2.0',
				method: 'eth_call',
				params: [{ to: WBTC_ARB, data: balanceOfData }, hexBlock],
				id: i + 1 + endOfDayTimestamps.length
			});
		}

		// Step 4: Send batch request (1 HTTP call for all days × 2 tokens)
		const batchResponse = await fetchWithTimeout(ARBITRUM_RPC, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(batchRequest)
		});

		if (!batchResponse.ok) {
			console.warn(
				'[BalanceHistoryService] Arbitrum batch RPC returned status',
				batchResponse.status
			);
			return { usdt0Map, wbtcSatsMap };
		}

		const batchResults: Array<{ id: number; result?: string }> = await batchResponse.json();

		// Step 5: Parse results
		const n = endOfDayTimestamps.length;
		for (const item of batchResults) {
			if (!item.result || item.result === '0x') continue;
			const idx = item.id - 1;
			if (idx >= 0 && idx < n) {
				// USDT0: 6 decimals → USD value
				usdt0Map.set(endOfDayTimestamps[idx], parseFloat(ethers.formatUnits(item.result, 6)));
			} else if (idx >= n && idx < n * 2) {
				// wBTC: 8 decimals → sats (same precision as BTC)
				const wbtcSats = Number(BigInt(item.result) / BigInt(10_000_000_000));
				wbtcSatsMap.set(endOfDayTimestamps[idx - n], wbtcSats);
			}
		}
	} catch (err) {
		console.warn('[BalanceHistoryService] Failed to fetch Arbitrum token balances:', err);
	}

	return { usdt0Map, wbtcSatsMap };
}

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
const CACHE_KEY_PREFIX = 'balance_history_v12_';
const FETCH_TIMEOUT_MS = 10_000; // 10-second timeout for individual fetch calls

/** Fetch with AbortController timeout */
async function fetchWithTimeout(
	url: string,
	options?: RequestInit,
	timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

/** Get RPC URL from provider with type-safe guard */
export function getRpcUrl(provider: ethers.Provider | null): string {
	if (provider instanceof ethers.JsonRpcProvider) {
		return (
			((provider as unknown as Record<string, unknown>).connection as { url?: string })?.url ||
			'https://public-node.rsk.co'
		);
	}
	return 'https://public-node.rsk.co';
}

/**
 * Historical Balance Service
 * Singleton service for managing historical balance data
 */
class HistoricalBalanceService {
	// In-memory caches
	private blockNumberCache: Map<string, number | null> = new Map();
	private latestBlockCache: Map<string, { block: ethers.Block | null; timestamp: number }> =
		new Map();
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
		if (!address) {
			return this.getEmptyBalanceChanges();
		}

		// Race against a timeout — hung network calls (Blockscout, RPC) must
		// not leave the UI in an endless loading state.
		const BALANCE_HISTORY_TIMEOUT_MS = 20_000;
		try {
			return await Promise.race([
				this._getBalanceChanges(currentSats, currentUsd, provider, address),
				new Promise<BalanceChange[]>((resolve) =>
					setTimeout(() => resolve(this.getEmptyBalanceChanges()), BALANCE_HISTORY_TIMEOUT_MS)
				)
			]);
		} catch (err) {
			console.warn(
				'[BalanceHistoryService] getBalanceChanges failed: ' +
					(err instanceof Error ? err.message : String(err))
			);
			return this.getEmptyBalanceChanges();
		}
	}

	private async _getBalanceChanges(
		currentSats: number,
		currentUsd: number,
		provider: ethers.Provider | null,
		address: string
	): Promise<BalanceChange[]> {
		// Clear old cache formats on first use (one-time migration)
		// This ensures old cache formats are removed immediately
		if (!this.oldCacheFormatsCleared) {
			await this.clearOldCacheFormats();
			this.oldCacheFormatsCleared = true;
		}

		const now = Date.now();
		const cacheKey = this.getCacheKey(address);

		// Also check and clear old format for this specific cache key
		// This handles cases where the cache key might have been created before the migration
		await this.clearOldCacheFormatForKey(cacheKey);

		// Check cache for historical data (not calculated changes)
		let historicalBalances: Array<number> | null = null;
		let historicalPrices: Array<number | null> | null = null;
		let blockNumbers: Array<number | null> | null = null;

		const cachedHistoricalData = await this.getCachedHistoricalData(cacheKey);
		if (cachedHistoricalData) {
			historicalBalances = cachedHistoricalData.historicalBalances;
			historicalPrices = cachedHistoricalData.historicalPrices;
			blockNumbers = cachedHistoricalData.blockNumbers;
		} else {
			// Fetch fresh historical data
			try {
				// Pre-fetch all historical data in parallel
				const prefetched = await this.prefetchHistoricalData(this.periods, now, provider);
				historicalPrices = prefetched.historicalPrices;
				blockNumbers = prefetched.blockNumbers;

				// Pre-fetch all historical balances in parallel
				historicalBalances = await this.prefetchHistoricalBalances(blockNumbers, provider, address);

				// Cache historical data (not calculated changes)
				if (historicalBalances && historicalPrices && blockNumbers) {
					await this.setCachedHistoricalData(cacheKey, {
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
		if (
			historicalBalances.length !== this.periods.length ||
			historicalPrices.length !== this.periods.length ||
			blockNumbers.length !== this.periods.length
		) {
			console.error('[BalanceHistoryService] Historical data array length mismatch');
			return this.getEmptyBalanceChanges();
		}

		// Prefetch stablecoin balances at the same historical blocks
		const historicalStablecoinUsd: number[] = await Promise.all(
			blockNumbers.map((bn) =>
				bn && address && provider
					? fetchStablecoinUsdAtBlock(provider, address, bn)
					: Promise.resolve(0)
			)
		);

		// Always recalculate changes using current balance (even with cached historical data)
		try {
			const results = await Promise.all(
				this.periods.map(async (period, index) => {
					try {
						const historicalBalanceSats = historicalBalances[index];
						const historicalPrice = historicalPrices[index];
						const stablecoinUsd = historicalStablecoinUsd[index] ?? 0;

						if (historicalBalanceSats === undefined || historicalPrice === null) {
							return this.getEmptyBalanceChange(period.label);
						}

						return this.calculatePeriodComparison(
							period,
							historicalBalanceSats,
							historicalPrice,
							stablecoinUsd,
							currentSats,
							currentUsd
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
		provider: ethers.Provider | null,
		network: 'rsk' | 'bsc'
	): Promise<ethers.Block | null> {
		if (!provider) return null;
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
	 * Get block number by timestamp using Blockscout API (RSK) or free Binance RPC (BSC)
	 * For BSC, uses free public RPC endpoint with client-side estimation (no API key required)
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

			if (network === 'rsk') {
				// RSK: Use Blockscout API (no API key required)
				// Hardcoded URLs as fallback — wallet-core import may be unavailable at runtime
				let explorerApiUrl: string | null =
					rskNetwork === 'mainnet'
						? 'https://rootstock.blockscout.com/api'
						: 'https://rootstock-testnet.blockscout.com/api';

				// Try wallet-core config first, fall back to hardcoded
				try {
					const configuredUrl = RSK_NETWORKS?.[rskNetwork as 'mainnet' | 'testnet']?.explorerApiUrl;
					if (configuredUrl) explorerApiUrl = configuredUrl;
				} catch {
					// RSK_NETWORKS not available — use hardcoded fallback
				}

				if (!explorerApiUrl) {
					return null;
				}

				const timestampSeconds = Math.floor(targetTimestamp / 1000);
				const apiUrl = `${explorerApiUrl}?module=block&action=getblocknobytime&timestamp=${timestampSeconds}&closest=before`;

				const response = await fetchWithTimeout(apiUrl);
				if (!response.ok) {
					console.warn(`[BalanceHistoryService] RSK API returned status ${response.status}`);
					return null;
				}

				const data = await response.json();
				if (data.status === '1' && data.result) {
					let blockNumberStr: string;
					if (typeof data.result === 'string') {
						blockNumberStr = data.result;
					} else if (
						typeof data.result === 'object' &&
						data.result !== null &&
						'blockNumber' in data.result
					) {
						blockNumberStr = String(data.result.blockNumber);
					} else {
						console.warn(
							'[BalanceHistoryService] RSK API returned unexpected result format:',
							data
						);
						return null;
					}

					const blockNumber = parseInt(blockNumberStr, 10);
					if (!isNaN(blockNumber) && blockNumber > 0) {
						return blockNumber;
					}
				}
				return null;
			} else if (network === 'bsc') {
				// BSC: Use free Binance RPC endpoint (no API key required)
				if (this.bscIndexingUnavailable) {
					return null;
				}

				const bscConfig = getBSCConfig();
				// Use free Binance public RPC endpoint
				const rpcUrl = bscConfig.rpcUrl || 'https://bsc-dataseed.binance.org/';

				// Get current block to estimate target block
				const currentBlockResponse = await fetchWithTimeout(rpcUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						method: 'eth_getBlockByNumber',
						params: ['latest', false],
						id: 1
					})
				});

				if (!currentBlockResponse.ok) {
					console.warn(
						`[BalanceHistoryService] BSC RPC returned status ${currentBlockResponse.status}`
					);
					return null;
				}

				const currentBlockData = await currentBlockResponse.json();
				if (!currentBlockData.result) {
					return null;
				}

				const currentBlockNumber = parseInt(currentBlockData.result.number, 16);
				const currentTimestamp = parseInt(currentBlockData.result.timestamp, 16) * 1000; // Convert to ms

				// If target is in the future or very recent, use latest block
				if (targetTimestamp >= currentTimestamp) {
					return currentBlockNumber;
				}

				// Estimate block number (BSC blocks ~3 seconds apart)
				const BSC_BLOCK_TIME = 3; // seconds
				const timeDiff = (currentTimestamp - targetTimestamp) / 1000; // Convert to seconds
				const estimatedBlock = Math.max(
					0,
					currentBlockNumber - Math.floor(timeDiff / BSC_BLOCK_TIME)
				);

				// Binary search to find exact block (within ±100 blocks for efficiency)
				const searchRange = 100;
				const minBlock = Math.max(0, estimatedBlock - searchRange);
				const maxBlock = Math.min(currentBlockNumber, estimatedBlock + searchRange);

				return await this.binarySearchBlockByTimestamp(rpcUrl, targetTimestamp, minBlock, maxBlock);
			}

			return null;
		} catch (error) {
			console.warn('[BalanceHistoryService] API/RPC failed:', error);
			return null;
		}
	}

	/**
	 * Binary search to find block number closest to target timestamp
	 * Uses free Binance RPC endpoint (no API key required)
	 */
	private async binarySearchBlockByTimestamp(
		rpcUrl: string,
		targetTimestamp: number,
		minBlock: number,
		maxBlock: number
	): Promise<number | null> {
		const targetTimestampSeconds = Math.floor(targetTimestamp / 1000);
		let left = minBlock;
		let right = maxBlock;
		let bestBlock = minBlock;
		let bestDiff = Infinity;

		// Limit iterations to prevent excessive RPC calls
		const maxIterations = 20;
		let iterations = 0;

		while (left <= right && iterations < maxIterations) {
			iterations++;
			const mid = Math.floor((left + right) / 2);

			try {
				const response = await fetchWithTimeout(rpcUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						method: 'eth_getBlockByNumber',
						params: ['0x' + mid.toString(16), false],
						id: 1
					})
				});

				if (!response.ok) {
					break;
				}

				const data = await response.json();
				if (!data.result) {
					break;
				}

				const blockTimestamp = parseInt(data.result.timestamp, 16);
				const diff = Math.abs(blockTimestamp - targetTimestampSeconds);

				if (diff < bestDiff) {
					bestDiff = diff;
					bestBlock = mid;
				}

				if (blockTimestamp < targetTimestampSeconds) {
					left = mid + 1;
				} else {
					right = mid - 1;
				}
			} catch (error) {
				console.warn(`[BalanceHistoryService] Error fetching block ${mid}:`, error);
				break;
			}
		}

		return bestBlock > 0 ? bestBlock : null;
	}

	/**
	 * Get block number closest to a timestamp (optimized: API first, then RPC fallback)
	 */
	private async getBlockNumberAtTimestamp(
		provider: ethers.Provider | null,
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
		} catch (error: unknown) {
			// Check for BSC indexing errors
			const err = error as { message?: string; code?: number };
			if (
				network === 'bsc' &&
				(err.message?.includes("state histories haven't been fully indexed") || err.code === -32000)
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
			console.error(
				`[BalanceHistoryService] Error fetching historical price for ${daysAgo}d ago:`,
				error
			);
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
			return this.getBlockNumberAtTimestamp(
				rskProvider,
				targetTimestamp,
				'rsk',
				latestBlockPromise || undefined
			);
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
		if (!rskAddress) {
			return blockNumbers.map(() => 0);
		}

		// Normalize address to valid EIP-55 checksum (ethers v6 rejects non-checksummed addresses)
		let address: string;
		try {
			address = ethers.getAddress(rskAddress);
		} catch {
			console.warn('[BalanceHistoryService] Invalid address checksum, using as-is:', rskAddress);
			address = rskAddress;
		}

		// Fetch sequentially with retries to avoid rate-limiting the public RPC
		const results: number[] = [];
		for (const blockNumber of blockNumbers) {
			if (blockNumber === null) {
				results.push(0);
				continue;
			}

			let sats = 0;
			for (let attempt = 0; attempt < 3; attempt++) {
				try {
					// Direct RPC fetch — bypasses ethers provider entirely
					// (ethers v6 send/getBalance may reject non-checksummed
					// addresses even after ethereum.getAddress normalization)
					const rpcUrl = getRpcUrl(rskProvider);
					const hexBlock = '0x' + blockNumber.toString(16);
					const res = await fetch(rpcUrl, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							jsonrpc: '2.0',
							method: 'eth_getBalance',
							params: [address, hexBlock],
							id: 1
						})
					});
					const data = await res.json();
					const balanceWei = BigInt(data?.result || '0x0');
					sats = Number(balanceWei / BigInt(10_000_000_000));
					break;
				} catch {
					if (attempt < 2) {
						await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); // 500ms, 1000ms backoff
					}
				}
			}
			results.push(sats);
			// Small delay between calls to avoid rate limiting
			await new Promise((r) => setTimeout(r, 200));
		}

		return results;
	}

	/**
	 * Calculate comparison for a single period
	 */
	private calculatePeriodComparison(
		period: Period,
		historicalBalanceSats: number,
		historicalPrice: number,
		historicalStablecoinUsd: number,
		currentSats: number,
		currentUsd: number
	): BalanceChange {
		// Calculate historical USD value using the historical BTC price + stablecoin balances
		const historicalBtcAmount = historicalBalanceSats / 100_000_000;
		const historicalBtcUsd = historicalBtcAmount * historicalPrice;
		const historicalUsdValue = historicalBtcUsd + historicalStablecoinUsd;

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
	 * Get cached historical data from Preferences
	 */
	private async getCachedHistoricalData(cacheKey: string): Promise<HistoricalDataCache | null> {
		try {
			const { value: cached } = await Preferences.get({ key: cacheKey });
			if (!cached) return null;

			const entry = JSON.parse(cached);
			const now = Date.now();

			// Check if this is the old cache format (has 'data' property with BalanceChange[])
			// If so, clear it and return null to force fresh fetch
			if (entry.data && Array.isArray(entry.data)) {
				// Check if it looks like old format (BalanceChange array)
				if (
					entry.data.length > 0 &&
					entry.data[0] &&
					typeof entry.data[0] === 'object' &&
					'satsChange' in entry.data[0]
				) {
					await Preferences.remove({ key: cacheKey });
					return null;
				}
			}

			// Validate new cache format - must have all required properties
			if (
				!entry.historicalBalances ||
				!Array.isArray(entry.historicalBalances) ||
				!entry.historicalPrices ||
				!Array.isArray(entry.historicalPrices) ||
				!entry.blockNumbers ||
				!Array.isArray(entry.blockNumbers)
			) {
				await Preferences.remove({ key: cacheKey });
				return null;
			}

			// Validate array lengths match expected periods
			if (
				entry.historicalBalances.length !== this.periods.length ||
				entry.historicalPrices.length !== this.periods.length ||
				entry.blockNumbers.length !== this.periods.length
			) {
				await Preferences.remove({ key: cacheKey });
				return null;
			}

			// Check if cache is still valid
			if (entry.expiresAt && now < entry.expiresAt) {
				return entry as HistoricalDataCache;
			}

			// Cache expired, remove it
			await Preferences.remove({ key: cacheKey });
			return null;
		} catch (error) {
			console.error('[BalanceHistoryService] Error reading cache:', error);

			// Clear potentially corrupted cache
			await Preferences.remove({ key: cacheKey });
			return null;
		}
	}

	/**
	 * Set cached historical data in Preferences with daily expiration
	 */
	private async setCachedHistoricalData(
		cacheKey: string,
		data: HistoricalDataCache
	): Promise<void> {
		try {
			await Preferences.set({ key: cacheKey, value: JSON.stringify(data) });
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
	async clearCaches(): Promise<void> {
		this.blockNumberCache.clear();
		this.latestBlockCache.clear();
		this.historicalPricesCache.clear();

		// Clear Preferences cache
		try {
			const { keys } = await Preferences.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith(CACHE_KEY_PREFIX))
					.map((key) => Preferences.remove({ key }))
			);
		} catch (error) {
			console.error('[BalanceHistoryService] Error clearing Preferences cache:', error);
		}
	}

	/**
	 * Clear old cache format for a specific cache key
	 */
	private async clearOldCacheFormatForKey(cacheKey: string): Promise<void> {
		try {
			const { value: cached } = await Preferences.get({ key: cacheKey });
			if (!cached) return;

			const entry = JSON.parse(cached);

			// Check if this is the old format (has 'data' property with BalanceChange[])
			if (entry.data && Array.isArray(entry.data)) {
				if (
					entry.data.length > 0 &&
					entry.data[0] &&
					typeof entry.data[0] === 'object' &&
					'satsChange' in entry.data[0]
				) {
					await Preferences.remove({ key: cacheKey });
				}
			}
		} catch (err) {
			console.warn(
				'[BalanceHistoryService] Failed to clear old cache: ' +
					(err instanceof Error ? err.message : String(err))
			);
			// If parsing fails, remove the cache entry
			await Preferences.remove({ key: cacheKey });
		}
	}

	/**
	 * Clear old cache formats (migration helper)
	 * Call this once to migrate from old cache format to new format
	 */
	async clearOldCacheFormats(): Promise<void> {
		try {
			const { keys } = await Preferences.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith(CACHE_KEY_PREFIX))
					.map((key) => this.clearOldCacheFormatForKey(key))
			);
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
		_currentUsd: number = 0
	): Promise<Array<{ date: Date; sats: number; usd: number; usdt0: number }>> {
		if (!address) {
			return [];
		}

		// Normalize address to valid EIP-55 checksum
		let checksummed: string;
		try {
			checksummed = ethers.getAddress(address);
		} catch {
			console.warn('[BalanceHistoryService] Invalid address checksum for chart:', address);
			checksummed = address;
		}

		const results: Array<{ date: Date; sats: number; usd: number; usdt0: number }> = [];
		const now = Date.now();
		const endTimestamp = endDate.getTime();
		const startTimestamp = startDate.getTime();
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Calculate number of days
		const daysDiff = Math.ceil((endTimestamp - startTimestamp) / (24 * 60 * 60 * 1000));

		// Limit to reasonable number of days (max 365)
		const maxDays = Math.min(daysDiff, 365);

		// Collect all end-of-day timestamps for Arbitrum batch fetch
		const endOfDayTimestamps: number[] = [];
		const targetDates: Date[] = [];
		for (let i = 0; i <= maxDays; i++) {
			const targetDate = new Date(startTimestamp + i * 24 * 60 * 60 * 1000);
			targetDate.setHours(0, 0, 0, 0);
			if (targetDate.getTime() > now) continue;
			targetDates.push(targetDate);
			const eod = new Date(targetDate);
			eod.setHours(23, 59, 59, 999);
			endOfDayTimestamps.push(eod.getTime());
		}

		// Fire Arbitrum token batch fetch in background (runs in parallel with RSK fetches)
		const arbTokensPromise = fetchArbitrumTokensBatch(checksummed, endOfDayTimestamps);

		// Get latest block for RPC fallback
		const latestBlockPromise = this.getCachedLatestBlock(provider, 'rsk');

		// RPC endpoint for direct balance queries
		const rpcUrl = getRpcUrl(provider);

		// Fetch RSK balances for each day
		const balancePromises: Promise<{ date: Date; sats: number; usd: number }>[] = [];

		// Pre-fetch current BTC price for "today" USD calculation
		// (avoids including BSC/RSK/wBTC balances in the chart's $ Value line)
		const currentBtcPrice = await this.fetchHistoricalPrice(0);

		for (const targetDate of targetDates) {
			const targetTimestamp = targetDate.getTime();

			// Check if this is today or in the future - use current balance
			const isTodayOrFuture = targetTimestamp >= today.getTime();

			if (isTodayOrFuture) {
				// BTC-only USD for chart — excludes RSK stablecoins, BSC, wBTC
				const btcOnlyUsd = currentBtcPrice ? (currentSats / 100_000_000) * currentBtcPrice : 0;
				balancePromises.push(
					Promise.resolve({ date: targetDate, sats: currentSats, usd: btcOnlyUsd })
				);
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
							return { date: targetDate, sats: 0, usd: 0 };
						}

						// Get balance at this block via direct RPC (bypass ethers checksum)
						const hexBlock = '0x' + blockNumber.toString(16);
						const balanceRes = await fetch(rpcUrl, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								jsonrpc: '2.0',
								method: 'eth_getBalance',
								params: [checksummed, hexBlock],
								id: 1
							})
						});
						const balanceData = await balanceRes.json();
						const balanceWei = BigInt(balanceData?.result || '0x0');
						const sats = Number(balanceWei / BigInt(10_000_000_000));

						// Get historical price for this day
						const daysAgo = Math.floor((now - targetEndOfDay) / (24 * 60 * 60 * 1000));
						const btcPrice = await this.fetchHistoricalPrice(daysAgo);

						// USD = BTC value only (USDT0 on Arbitrum is fetched separately
						// and merged in below — RSK stablecoins are excluded from the chart)
						const btcAmount = sats / 100_000_000;
						const usd = btcPrice ? btcAmount * btcPrice : 0;

						return { date: targetDate, sats, usd };
					} catch (error) {
						console.error(
							`[BalanceHistoryService] Error fetching balance for ${targetDate.toISOString()}:`,
							error
						);
						// Return zero balance instead of failing - ensures we have data points
						return { date: targetDate, sats: 0, usd: 0 };
					}
				})()
			);
		}

		// Fetch all RSK balances in parallel (batch of 10)
		const rskResults: Array<{ date: Date; sats: number; usd: number }> = [];
		const batchSize = 10;
		for (let i = 0; i < balancePromises.length; i += batchSize) {
			const batch = balancePromises.slice(i, i + batchSize);
			const batchResults = await Promise.all(batch);
			rskResults.push(...batchResults);
		}

		// Await Arbitrum token results (USDT0 + wBTC)
		const { usdt0Map, wbtcSatsMap } = await arbTokensPromise;

		// Merge RSK + Arbitrum data
		for (const rsk of rskResults) {
			const eod = new Date(rsk.date);
			eod.setHours(23, 59, 59, 999);
			const ts = eod.getTime();
			const usdt0 = usdt0Map.get(ts) ?? 0;
			const wbtcSats = wbtcSatsMap.get(ts) ?? 0;
			// Add wBTC sats to BTC sats for the chart's BTC bar
			results.push({ ...rsk, sats: rsk.sats + wbtcSats, usdt0 });
		}

		// Sort by date
		results.sort((a, b) => a.date.getTime() - b.date.getTime());

		return results;
	}
}

// Export singleton instance
export default new HistoricalBalanceService();
