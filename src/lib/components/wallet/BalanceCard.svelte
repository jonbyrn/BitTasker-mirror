<script lang="ts">
	import type { WalletAsset } from '@bittasker/wallet-core';
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy, untrack } from 'svelte';
	import { allAssets, totalBalances, walletManager, walletStore, formatSats, isAssetsLoading } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { ethers } from 'ethers';
	import { RSK_NETWORKS, getBSCConfig } from '$lib/utils/wallet/networkConfig';
	import IconDownload from '~icons/mdi/download';
	import IconUpload from '~icons/mdi/upload';
	import IconCashMultiple from '~icons/mdi/cash-multiple';
	import IconSwapHorizontal from '~icons/mdi/swap-horizontal';
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';
	import IconHelpCircle from '~icons/mdi/help-circle';
	import IconRefresh from '~icons/mdi/refresh';
	import IconEye from '~icons/mdi/eye';
	import IconEyeOff from '~icons/mdi/eye-off';
	import IconChevronRight from '~icons/mdi/chevron-right';
	import HelpModal from '$lib/components/wallet/HelpModal.svelte';

	let {
		onReceive,
		onSend,
		onBuySell,
		onSwap,
		onTransactions
	}: {
		onReceive?: () => void;
		onSend?: () => void;
		onBuySell?: () => void;
		onSwap?: () => void;
		onTransactions?: () => void;
	} = $props();

	// Refresh state
	let isRefreshing = $state(false);

	// Balance visibility state
	let balancesHidden = $state(true);
	let countdownSeconds = $state(0);
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	// Use actual sats from wallet (sum of all sats, not converted)
	let totalUsdValue = $derived($totalBalances.usd);
	let totalSats = $derived($totalBalances.sats);
	let bitcoinExpanded = $state(false);
	let usdExpanded = $state(false);

	// Historical balance and price tracking
	let historicalPrices = $state<{ [key: string]: number }>({});
	let historicalBalances = $state<{ [key: string]: number | null }>({});
	
	// Cache for block number lookups (key: network_timestamp, value: blockNumber)
	let blockNumberCache = $state<{ [key: string]: number | null }>({});
	
	// Cache for latest block (key: network, value: { block, timestamp })
	let latestBlockCache = $state<{ [key: string]: { block: ethers.Block | null; timestamp: number } | null }>({});
	const LATEST_BLOCK_CACHE_TTL = 60 * 1000; // 60 seconds
	
	// Track if calculation is in progress to prevent concurrent runs
	let isCalculatingBalanceChanges = $state(false);
	// Track last calculated values to prevent recalculating with same values
	let lastCalculatedSats = $state<number | undefined>(undefined);
	let lastCalculatedUsd = $state<number | undefined>(undefined);

	// Helper to convert wei to sats
	function weiToSatoshi(wei: bigint): number {
		const rbtc = Number(ethers.formatEther(wei));
		return Math.floor(rbtc * 100_000_000);
	}

	// Get cached latest block (cached for 60 seconds to avoid repeated calls)
	async function getCachedLatestBlock(provider: ethers.Provider, network: 'rsk' | 'bsc'): Promise<ethers.Block | null> {
		const startTime = performance.now();
		const cacheKey = network;
		const cached = latestBlockCache[cacheKey];
		const now = Date.now();
		
		// Use cache if it exists and is fresh (within TTL)
		if (cached && cached.block && (now - cached.timestamp) < LATEST_BLOCK_CACHE_TTL) {
			const duration = performance.now() - startTime;
			console.log(`[BalanceCard] [TIMING] Latest block cache HIT for ${network}: ${duration.toFixed(2)}ms`);
			return cached.block;
		}
		
		// Fetch fresh block
		try {
			const fetchStart = performance.now();
			const block = await provider.getBlock('latest');
			const fetchDuration = performance.now() - fetchStart;
			if (block) {
				latestBlockCache[cacheKey] = { block, timestamp: now };
				const totalDuration = performance.now() - startTime;
				console.log(`[BalanceCard] [TIMING] Latest block cache MISS for ${network}: fetch=${fetchDuration.toFixed(2)}ms, total=${totalDuration.toFixed(2)}ms`);
				return block;
			}
		} catch (error) {
			const duration = performance.now() - startTime;
			console.warn(`[BalanceCard] [TIMING] Failed to fetch latest block for ${network} (${duration.toFixed(2)}ms):`, error);
		}
		
		return null;
	}

	// Get block number by timestamp using Blockscout/BSCScan API (fast, single HTTP request)
	// This can be called immediately without waiting for latest blocks
	async function getBlockNumberAtTimestampViaAPI(targetTimestamp: number, network: 'rsk' | 'bsc'): Promise<number | null> {
		const apiStart = performance.now();
		
		// Early exit: Skip BSC API if indexing is unavailable
		if (network === 'bsc' && bscIndexingUnavailable) {
			const duration = performance.now() - apiStart;
			console.log(`[BalanceCard] [TIMING] BSC API skipped (indexing unavailable): ${duration.toFixed(2)}ms`);
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
			// Blockscout doesn't require API key
		} else if (network === 'bsc') {
			// Double-check indexing availability before proceeding
			if (bscIndexingUnavailable) {
				const duration = performance.now() - apiStart;
				console.log(`[BalanceCard] [TIMING] BSC API skipped (indexing unavailable, checked again): ${duration.toFixed(2)}ms`);
				return null;
			}
			
			// Use the same BSC config pattern as loadBSCTransactions
			const bscConfig = getBSCConfig(bscNetwork as 'mainnet' | 'testnet');
			explorerApiUrl = bscConfig.explorerApiUrl;
			chainId = String(bscConfig.chainId);
			// Get BSCScan API key from environment (same as loadBSCTransactions)
			apiKey = import.meta.env.VITE_BSCSCAN_API_KEY || null;
		}
		
		if (!explorerApiUrl) {
			return null;
		}
		
		// Convert milliseconds to seconds (Unix timestamp)
		const timestampSeconds = Math.floor(targetTimestamp / 1000);
		
		// Build API URL
		// Blockscout: https://rootstock.blockscout.com/api?module=block&action=getblocknobytime&timestamp=...
		// Etherscan V2 (BSC): https://api.etherscan.io/v2/api?chainid=56&module=block&action=getblocknobytime&timestamp=...&apikey=...
		let apiUrl: string;
		if (network === 'rsk') {
			apiUrl = `${explorerApiUrl}?module=block&action=getblocknobytime&timestamp=${timestampSeconds}&closest=before`;
		} else {
			// BSC uses Etherscan API V2 - add chainid and apikey as query parameters
			apiUrl = `${explorerApiUrl}?chainid=${chainId}&module=block&action=getblocknobytime&timestamp=${timestampSeconds}&closest=before`;
			if (apiKey) {
				apiUrl += `&apikey=${apiKey}`;
			}
		}
			
			const fetchStart = performance.now();
			const response = await fetch(apiUrl);
			const fetchDuration = performance.now() - fetchStart;
			
			if (!response.ok) {
				console.warn(`[BalanceCard] [TIMING] ${network === 'rsk' ? 'Blockscout' : 'BSCScan'} API returned status ${response.status} (${fetchDuration.toFixed(2)}ms)`);
				return null;
			}
			
			const data = await response.json();
			const totalDuration = performance.now() - apiStart;
			
			// Blockscout API returns: { status: '1', message: 'OK', result: { blockNumber: '1234567' } }
			// BSCScan API returns: { status: '1', message: 'OK', result: '1234567' }
			if (data.status === '1' && data.result) {
				let blockNumberStr: string;
				
				// Handle different response formats
				if (typeof data.result === 'string') {
					// BSCScan format: result is a string
					blockNumberStr = data.result;
				} else if (typeof data.result === 'object' && data.result !== null && 'blockNumber' in data.result) {
					// Blockscout format: result is an object with blockNumber property
					blockNumberStr = String(data.result.blockNumber);
				} else {
					console.warn(`[BalanceCard] [TIMING] ${network === 'rsk' ? 'Blockscout' : 'BSCScan'} API returned unexpected result format (${totalDuration.toFixed(2)}ms):`, data);
					return null;
				}
				
				const blockNumber = parseInt(blockNumberStr, 10);
				if (!isNaN(blockNumber) && blockNumber > 0) {
					console.log(`[BalanceCard] [TIMING] ${network === 'rsk' ? 'Blockscout' : 'BSCScan'} API lookup for ${network}: fetch=${fetchDuration.toFixed(2)}ms, total=${totalDuration.toFixed(2)}ms`);
					return blockNumber;
				}
			}
			
			console.warn(`[BalanceCard] [TIMING] ${network === 'rsk' ? 'Blockscout' : 'BSCScan'} API returned invalid result (${totalDuration.toFixed(2)}ms):`, data);
			return null;
		} catch (error) {
			const duration = performance.now() - apiStart;
			console.warn(`[BalanceCard] [TIMING] ${network === 'rsk' ? 'Blockscout' : 'BSCScan'} API failed for ${network} (${duration.toFixed(2)}ms):`, error);
			return null;
		}
	}

	// Get block number closest to a timestamp (optimized: API first, then RPC fallback)
	// providedCurrentBlockPromise: Promise that resolves to latest block (only needed if API fails)
	async function getBlockNumberAtTimestamp(provider: ethers.Provider, targetTimestamp: number, network: 'rsk' | 'bsc', providedCurrentBlockPromise?: Promise<ethers.Block | null>): Promise<number | null> {
		const startTime = performance.now();
		
		// Early exit: Skip BSC block lookup if indexing is unavailable
		if (network === 'bsc' && bscIndexingUnavailable) {
			const duration = performance.now() - startTime;
			console.log(`[BalanceCard] [TIMING] BSC block lookup skipped (indexing unavailable): ${duration.toFixed(2)}ms`);
			return null;
		}
		
		// Check cache first (cache key: network_timestamp rounded to nearest hour)
		const cacheKey = `${network}_${Math.floor(targetTimestamp / (60 * 60 * 1000))}`;
		if (blockNumberCache[cacheKey] !== undefined) {
			const duration = performance.now() - startTime;
			console.log(`[BalanceCard] [TIMING] Block number cache HIT for ${network} at ${new Date(targetTimestamp).toISOString()}: ${duration.toFixed(2)}ms`);
			return blockNumberCache[cacheKey];
		}
		
		// Try Blockscout API first (much faster than RPC) - can start immediately
		const apiStart = performance.now();
		const apiBlockNumber = await getBlockNumberAtTimestampViaAPI(targetTimestamp, network);
		const apiDuration = performance.now() - apiStart;
		
		if (apiBlockNumber !== null) {
			// Cache and return API result
			blockNumberCache[cacheKey] = apiBlockNumber;
			const totalDuration = performance.now() - startTime;
			console.log(`[BalanceCard] [TIMING] Block lookup via API for ${network}: api=${apiDuration.toFixed(2)}ms, total=${totalDuration.toFixed(2)}ms`);
			return apiBlockNumber;
		}
		
		// API failed, check if BSC indexing became unavailable during API call
		if (network === 'bsc' && bscIndexingUnavailable) {
			const duration = performance.now() - startTime;
			console.log(`[BalanceCard] [TIMING] BSC RPC skipped (indexing unavailable after API failure): ${duration.toFixed(2)}ms`);
			return null;
		}
		
		// Fallback to RPC method if API fails - now we need latest block
		console.log(`[BalanceCard] [TIMING] API lookup failed for ${network}, falling back to RPC method`);
		
		try {
			// Get current block (use provided promise or fetch, cached for 60 seconds)
			const latestBlockStart = performance.now();
			const currentBlockToUse = providedCurrentBlockPromise ? await providedCurrentBlockPromise : await getCachedLatestBlock(provider, network);
			const latestBlockDuration = performance.now() - latestBlockStart;
			if (!currentBlockToUse || !currentBlockToUse.timestamp) return null;
			
			const currentBlockNumber = currentBlockToUse.number;
			const currentBlockTimestamp = currentBlockToUse.timestamp * 1000; // Convert to milliseconds
			
			// If target is in the future or very recent (within last block), use latest block
			if (targetTimestamp >= currentBlockTimestamp) {
				blockNumberCache[cacheKey] = currentBlockNumber;
				const duration = performance.now() - startTime;
				console.log(`[BalanceCard] [TIMING] Block lookup (recent) for ${network}: latest=${latestBlockDuration.toFixed(2)}ms, total=${duration.toFixed(2)}ms`);
				return currentBlockNumber;
			}
			
			// Calculate exact block estimate based on consistent block times
			// RSK: ~30s per block (very consistent), BSC: ~3s per block
			const blockTimeSeconds = network === 'rsk' ? 30 : 3;
			const blockTimeMs = blockTimeSeconds * 1000;
			const timeDiff = currentBlockTimestamp - targetTimestamp;
			const blocksAgo = Math.floor(timeDiff / blockTimeMs);
			const estimatedBlock = Math.max(0, currentBlockNumber - blocksAgo);
			
			// Adaptive tolerance based on period (older periods need wider tolerance)
			// 24h: ±30min, 7d: ±1h, 30d: ±2h
			const hoursAgo = timeDiff / (60 * 60 * 1000);
			let TOLERANCE_MS: number;
			if (hoursAgo <= 24) {
				TOLERANCE_MS = 30 * 60 * 1000; // 30 minutes for 24h
			} else if (hoursAgo <= 168) {
				TOLERANCE_MS = 60 * 60 * 1000; // 1 hour for 7d
			} else {
				TOLERANCE_MS = 2 * 60 * 60 * 1000; // 2 hours for 30d
			}
			
			// Use binary search for efficient block finding when estimate is off
			// First check the estimate and nearby blocks (±10 blocks) for quick match
			const quickSearchRange = 10;
			let blocksChecked = 0;
			let rpcCalls = 0;
			let bestBlock = estimatedBlock;
			let bestDiff = Infinity;
			
			// Quick search around estimate
			const quickSearchStart = performance.now();
			const quickSearchBlocks: number[] = [];
			for (let i = -quickSearchRange; i <= quickSearchRange; i++) {
				const blockNum = estimatedBlock + i;
				if (blockNum >= 0 && blockNum <= currentBlockNumber) {
					quickSearchBlocks.push(blockNum);
				}
			}
			
			const quickResults = await Promise.all(
				quickSearchBlocks.map(blockNum => 
					provider.getBlock(blockNum)
						.then(block => {
							if (!block || !block.timestamp) return null;
							const blockTimestamp = block.timestamp * 1000;
							const diff = Math.abs(blockTimestamp - targetTimestamp);
							return { blockNum, diff, inRange: diff <= TOLERANCE_MS };
						})
						.catch(() => null)
				)
			);
			
			rpcCalls += quickSearchBlocks.length;
			blocksChecked += quickSearchBlocks.length;
			const quickSearchDuration = performance.now() - quickSearchStart;
			
			// Check if we found a block within tolerance
			const inRangeBlock = quickResults.find(r => r?.inRange);
			if (inRangeBlock) {
				blockNumberCache[cacheKey] = inRangeBlock.blockNum;
				const totalDuration = performance.now() - startTime;
				console.log(`[BalanceCard] [TIMING] Block lookup for ${network} (quick search found): latest=${latestBlockDuration.toFixed(2)}ms, blocks_checked=${blocksChecked}, rpc_calls=${rpcCalls}, quick_search=${quickSearchDuration.toFixed(2)}ms, total=${totalDuration.toFixed(2)}ms`);
				console.log(`[BalanceCard] Found block ${inRangeBlock.blockNum} within tolerance (diff: ${(inRangeBlock.diff / 1000 / 60).toFixed(1)}min) for ${network} at ${new Date(targetTimestamp).toISOString()}`);
				return inRangeBlock.blockNum;
			}
			
			// Find best block from quick search for binary search starting point
			for (const result of quickResults) {
				if (result && result.diff < bestDiff) {
					bestDiff = result.diff;
					bestBlock = result.blockNum;
				}
			}
			
			// If quick search found something close enough (within 2x tolerance), use it
			if (bestDiff <= TOLERANCE_MS * 2) {
				blockNumberCache[cacheKey] = bestBlock;
				const totalDuration = performance.now() - startTime;
				console.log(`[BalanceCard] [TIMING] Block lookup for ${network} (quick search close enough): latest=${latestBlockDuration.toFixed(2)}ms, blocks_checked=${blocksChecked}, rpc_calls=${rpcCalls}, quick_search=${quickSearchDuration.toFixed(2)}ms, total=${totalDuration.toFixed(2)}ms`);
				console.log(`[BalanceCard] Found block ${bestBlock} (diff: ${(bestDiff / 1000 / 60).toFixed(1)}min, within 2x tolerance) for ${network} at ${new Date(targetTimestamp).toISOString()}`);
				return bestBlock;
			}
			
			// Fallback: Binary search if quick search didn't find a good match
			// Use the best block from quick search as starting point
			// Check BSC indexing availability before starting binary search
			if (network === 'bsc' && bscIndexingUnavailable) {
				const duration = performance.now() - startTime;
				console.log(`[BalanceCard] [TIMING] BSC binary search skipped (indexing unavailable): ${duration.toFixed(2)}ms`);
				return null;
			}
			
			const binarySearchStart = performance.now();
			// Optimize binary search range: smaller for BSC (faster block times), larger for RSK
			const searchRange = network === 'bsc' ? 500 : 1000; // BSC: ±500 blocks, RSK: ±1000 blocks
			let low = Math.max(0, bestBlock - searchRange);
			let high = Math.min(currentBlockNumber, bestBlock + searchRange);
			const maxBinaryIterations = network === 'bsc' ? 12 : 15; // Fewer iterations for BSC
			let iterations = 0;
			
			while (low <= high && iterations < maxBinaryIterations) {
				// Early exit check: if BSC indexing became unavailable during search
				if (network === 'bsc' && bscIndexingUnavailable) {
					const binarySearchDuration = performance.now() - binarySearchStart;
					const totalDuration = performance.now() - startTime;
					console.log(`[BalanceCard] [TIMING] BSC binary search aborted (indexing unavailable): binary_search=${binarySearchDuration.toFixed(2)}ms, total=${totalDuration.toFixed(2)}ms`);
					return null;
				}
				
				iterations++;
				const mid = Math.floor((low + high) / 2);
				
				// Check mid block and nearby blocks in parallel
				const checkBlocks = [mid, mid - 1, mid + 1].filter(b => b >= 0 && b <= currentBlockNumber && b >= low && b <= high);
				const binaryResults = await Promise.all(
					checkBlocks.map(blockNum => 
						provider.getBlock(blockNum)
							.then(block => {
								if (!block || !block.timestamp) return null;
								const blockTimestamp = block.timestamp * 1000;
								const diff = blockTimestamp - targetTimestamp; // Signed diff for binary search
								return { blockNum, diff: Math.abs(diff), signedDiff: diff };
							})
							.catch((error: any) => {
								// Check for indexing errors and set flag immediately
								if (network === 'bsc' && (
									error?.message?.includes('state histories haven\'t been fully indexed') ||
									error?.code === -32000
								)) {
									bscIndexingUnavailable = true;
								}
								return null;
							})
					)
				);
				
				rpcCalls += checkBlocks.length;
				blocksChecked += checkBlocks.length;
				
				// Find best block from this iteration
				for (const result of binaryResults) {
					if (result && result.diff < bestDiff) {
						bestDiff = result.diff;
						bestBlock = result.blockNum;
					}
				}
				
				// Check if we found a block within tolerance
				const inRangeResult = binaryResults.find(r => r && r.diff <= TOLERANCE_MS);
				if (inRangeResult) {
					blockNumberCache[cacheKey] = inRangeResult.blockNum;
					const binarySearchDuration = performance.now() - binarySearchStart;
					const totalDuration = performance.now() - startTime;
					console.log(`[BalanceCard] [TIMING] Block lookup for ${network} (binary search found): latest=${latestBlockDuration.toFixed(2)}ms, blocks_checked=${blocksChecked}, rpc_calls=${rpcCalls}, binary_search=${binarySearchDuration.toFixed(2)}ms, total=${totalDuration.toFixed(2)}ms`);
					console.log(`[BalanceCard] Found block ${inRangeResult.blockNum} within tolerance (diff: ${(inRangeResult.diff / 1000 / 60).toFixed(1)}min) for ${network} at ${new Date(targetTimestamp).toISOString()}`);
					return inRangeResult.blockNum;
				}
				
				// Binary search: if target is before mid block, search lower, else search higher
				const midResult = binaryResults.find(r => r && r.blockNum === mid);
				if (midResult && midResult.signedDiff > 0) {
					// Target is before mid block, search lower
					high = mid - 1;
				} else {
					// Target is after mid block, search higher
					low = mid + 1;
				}
			}
			
			const binarySearchDuration = performance.now() - binarySearchStart;
			// Cache the result
			blockNumberCache[cacheKey] = bestBlock;
			const totalDuration = performance.now() - startTime;
			console.log(`[BalanceCard] [TIMING] Block lookup for ${network} (binary search, best match): latest=${latestBlockDuration.toFixed(2)}ms, blocks_checked=${blocksChecked}, rpc_calls=${rpcCalls}, binary_search=${binarySearchDuration.toFixed(2)}ms, total=${totalDuration.toFixed(2)}ms`);
			console.log(`[BalanceCard] Found closest block ${bestBlock} (diff: ${(bestDiff / 1000 / 60).toFixed(1)}min) for ${network} at ${new Date(targetTimestamp).toISOString()}`);
			return bestBlock;
		} catch (error: any) {
			// Check for BSC indexing errors and set flag immediately
			if (network === 'bsc' && (
				error?.message?.includes('state histories haven\'t been fully indexed') ||
				error?.code === -32000
			)) {
				console.warn(`[BalanceCard] BSC historical indexing not available, setting flag to skip future attempts`);
				bscIndexingUnavailable = true;
			}
			console.error('[BalanceCard] Error finding block number at timestamp:', error);
			blockNumberCache[cacheKey] = null; // Cache null to avoid retrying
			return null;
		}
	}

	// Track BSC indexing errors to skip BSC queries if it's not available
	// Set to true by default since historical BSC data is not currently implemented
	let bscIndexingUnavailable = $state(true);
	
	// Fetch historical Bitcoin price using crypto price service
	async function fetchHistoricalPrice(daysAgo: number): Promise<number | null> {
		try {
			const cacheKey = `btc_price_${daysAgo}d`;
			if (historicalPrices[cacheKey]) {
				return historicalPrices[cacheKey];
			}

			// Use the crypto price service which handles CORS properly
			const price = await cryptoPriceService.getHistoricalPrice(daysAgo);
			
			if (price !== null) {
				historicalPrices[cacheKey] = price;
			}
			
			return price;
		} catch (error) {
			console.error(`[BalanceCard] Error fetching historical price for ${daysAgo}d ago:`, error);
			return null;
		}
	}

	// Pre-fetch all historical data in parallel (latest blocks, prices, block numbers)
	async function prefetchHistoricalData(
		periods: Array<{ hours: number; days: number }>,
		now: number,
		rskProvider: ethers.Provider | null
	): Promise<{
		latestBlocks: { rsk?: ethers.Block | null; bsc?: ethers.Block | null };
		historicalPrices: Array<number | null>;
		blockNumbers: Array<number | null>;
	}> {
		const parallelFetchStart = performance.now();
		console.log('[BalanceCard] Starting parallel fetch: latest blocks, prices, and block number API calls...');
		
		const state = $walletStore;
		
		// Start latest blocks fetch (needed for RPC fallback, but API calls don't wait for it)
		const latestBlocksPromises: { rsk?: Promise<ethers.Block | null>; bsc?: Promise<ethers.Block | null> } = {};
		if (state.rsk.provider) {
			latestBlocksPromises.rsk = getCachedLatestBlock(state.rsk.provider, 'rsk');
		}
		if (!bscIndexingUnavailable && state.bsc.provider) {
			latestBlocksPromises.bsc = getCachedLatestBlock(state.bsc.provider, 'bsc');
		}
		
		// Start all historical prices fetch in parallel (independent)
		const pricePromises = periods.map(period => fetchHistoricalPrice(period.days));
		
		// Start all block number API calls immediately (don't wait for latest blocks)
		// Pass latest block promises for RPC fallback (only used if API fails)
		const blockNumberPromises = periods.map(period => {
			const targetTimestamp = now - (period.hours * 60 * 60 * 1000);
			if (rskProvider) {
				// Pass the promise, not the resolved value - API call starts immediately
				return getBlockNumberAtTimestamp(rskProvider, targetTimestamp, 'rsk', latestBlocksPromises.rsk);
			}
			return Promise.resolve(null);
		});
		
		// Wait for all parallel operations to complete
		const [latestBlocksResults, historicalPricesArray, blockNumbersArray] = await Promise.all([
			Promise.allSettled([
				latestBlocksPromises.rsk || Promise.resolve(null),
				latestBlocksPromises.bsc || Promise.resolve(null)
			]).then(results => ({
				rsk: results[0].status === 'fulfilled' ? results[0].value : null,
				bsc: results[1].status === 'fulfilled' ? results[1].value : null
			})),
			Promise.all(pricePromises),
			Promise.all(blockNumberPromises)
		]);
		
		const parallelFetchDuration = performance.now() - parallelFetchStart;
		console.log(`[BalanceCard] [TIMING] Parallel fetch complete: ${parallelFetchDuration.toFixed(2)}ms`);
		console.log(`[BalanceCard] [TIMING] Latest blocks: resolved`);
		console.log(`[BalanceCard] [TIMING] Historical prices: ${historicalPricesArray.length} fetched`);
		console.log(`[BalanceCard] [TIMING] Block numbers: ${blockNumbersArray.length} fetched`);
		
		return {
			latestBlocks: latestBlocksResults,
			historicalPrices: historicalPricesArray,
			blockNumbers: blockNumbersArray
		};
	}

	// Pre-fetch all historical balances in parallel using pre-fetched block numbers
	async function prefetchHistoricalBalances(
		blockNumbers: Array<number | null>,
		rskProvider: ethers.Provider | null,
		rskAddress: string | null
	): Promise<Array<number>> {
		const balanceFetchStart = performance.now();
		console.log('[BalanceCard] Pre-fetching all historical balances in parallel...');
		
		const balancePromises = blockNumbers.map(blockNumber => {
			if (!rskProvider || !rskAddress || blockNumber === null) {
				return Promise.resolve(0);
			}
			return rskProvider.getBalance(rskAddress, blockNumber)
				.then(balanceWei => {
					const balanceRBTC = parseFloat(ethers.formatEther(balanceWei));
					return Math.floor(balanceRBTC * 100_000_000);
				})
				.catch(() => 0);
		});
		
		const historicalBalancesArray = await Promise.all(balancePromises);
		const balanceFetchDuration = performance.now() - balanceFetchStart;
		console.log(`[BalanceCard] [TIMING] All historical balances fetched: ${balanceFetchDuration.toFixed(2)}ms`);
		
		return historicalBalancesArray;
	}

	// Calculate comparison for a single period
	function calculatePeriodComparison(
		period: { label: string; hours: number },
		historicalBalanceSats: number,
		historicalPrice: number,
		currentSats: number,
		currentUsd: number,
		targetTimestamp: number
	): {
		label: string;
		satsChange: number;
		usdChange: number;
		satsPercentChange: number;
		usdPercentChange: number;
	} {
		const periodStart = performance.now();
		console.log(`[BalanceCard] --- Calculating ${period.label} comparison ---`);
		const targetDate = new Date(targetTimestamp);
		console.log(`[BalanceCard] ${period.label}: Target time: ${targetDate.toISOString()} (${period.hours} hours ago)`);
		
		console.log(`[BalanceCard] ${period.label}: Historical balance: ${historicalBalanceSats} sats`);
		console.log(`[BalanceCard] ${period.label}: Historical BTC price: $${historicalPrice.toFixed(2)}`);

		// Calculate historical USD value using the historical BTC price at that time
		// Convert sats to BTC, then multiply by historical BTC price
		const historicalBtcAmount = historicalBalanceSats / 100_000_000;
		const historicalUsdValue = historicalBtcAmount * historicalPrice;
		
		console.log(`[BalanceCard] ${period.label}: Historical USD value: $${historicalUsdValue.toFixed(2)} (${historicalBtcAmount.toFixed(8)} BTC × $${historicalPrice.toFixed(2)})`);
		
		// Calculate changes (current - historical)
		const satsChange = currentSats - historicalBalanceSats;
		const usdChange = currentUsd - historicalUsdValue;
		
		// Calculate percentage changes
		const satsPercentChange = historicalBalanceSats > 0 
			? ((satsChange / historicalBalanceSats) * 100) 
			: (currentSats > 0 ? 100 : 0);
		const usdPercentChange = historicalUsdValue > 0 
			? ((usdChange / historicalUsdValue) * 100) 
			: (currentUsd > 0 ? 100 : 0);
		
		console.log(`[BalanceCard] ${period.label}: ===== FINAL COMPARISON =====`);
		console.log(`[BalanceCard] ${period.label}: Historical: ${historicalBalanceSats} sats = $${historicalUsdValue.toFixed(2)}`);
		console.log(`[BalanceCard] ${period.label}: Current: ${currentSats} sats = $${currentUsd.toFixed(2)}`);
		console.log(`[BalanceCard] ${period.label}: Sats Change: ${satsChange > 0 ? '+' : ''}${satsChange} sats (${satsPercentChange > 0 ? '+' : ''}${satsPercentChange.toFixed(2)}%)`);
		console.log(`[BalanceCard] ${period.label}: USD Change: ${usdChange > 0 ? '+' : ''}$${usdChange.toFixed(2)} (${usdPercentChange > 0 ? '+' : ''}${usdPercentChange.toFixed(2)}%)`);
		const periodDuration = performance.now() - periodStart;
		console.log(`[BalanceCard] [TIMING] ${period.label} period complete: total=${periodDuration.toFixed(2)}ms`);
		console.log(`[BalanceCard] ${period.label}: --- End ${period.label} calculation ---`);
		
		return {
			label: period.label,
			satsChange,
			usdChange,
			satsPercentChange,
			usdPercentChange
		};
	}

	// Calculate balance changes for different periods
	let balanceChanges = $state<Array<{
		label: string;
		satsChange: number | null;
		usdChange: number | null;
		satsPercentChange: number | null;
		usdPercentChange: number | null;
	}>>([
		{ label: '24h', satsChange: null, usdChange: null, satsPercentChange: null, usdPercentChange: null },
		{ label: '7d', satsChange: null, usdChange: null, satsPercentChange: null, usdPercentChange: null },
		{ label: '30d', satsChange: null, usdChange: null, satsPercentChange: null, usdPercentChange: null }
	]);
	
	async function updateBalanceChanges() {
		// Prevent concurrent calculations
		if (isCalculatingBalanceChanges) {
			console.log('[BalanceCard] Calculation already in progress, skipping');
			return;
		}
		
		if ($isAssetsLoading || isRefreshing || totalSats === undefined || totalUsdValue === undefined) {
			console.log('[BalanceCard] Skipping updateBalanceChanges - loading or refreshing');
			return;
		}
		
		// Skip if balance is 0 (nothing to compare)
		if (totalSats === 0) {
			console.log('[BalanceCard] Skipping - zero balance');
			return;
		}

		isCalculatingBalanceChanges = true;
		const overallStartTime = performance.now();
		console.log('[BalanceCard] ========== Starting balance comparison calculation ==========');
		console.log(`[BalanceCard] Current state: ${totalSats} sats, $${totalUsdValue.toFixed(2)} USD`);

		const periods = [
			{ label: '24h', hours: 24, days: 1 },
			{ label: '7d', hours: 24 * 7, days: 7 },
			{ label: '30d', hours: 24 * 30, days: 30 }
		];
		
		const now = Date.now();
		const state = $walletStore;
		const rskProvider = state.rsk.provider;
		const rskAddress = state.rsk.address;
		
		// Pre-fetch all historical data in parallel
		const { latestBlocks, historicalPrices: historicalPricesArray, blockNumbers: blockNumbersArray } = 
			await prefetchHistoricalData(periods, now, rskProvider);
		
		// Pre-fetch all historical balances in parallel
		const historicalBalancesArray = await prefetchHistoricalBalances(
			blockNumbersArray,
			rskProvider,
			rskAddress
		);
		
		// Process all periods (calculations only, data already fetched)
		const periodsStart = performance.now();
		const results = await Promise.all(periods.map(async (period, index) => {
			try {
				const targetTimestamp = now - (period.hours * 60 * 60 * 1000);
				const historicalBalanceSats = historicalBalancesArray[index];
				const historicalPrice = historicalPricesArray[index];
				
				// Check if blockchain fetch failed (null) or price fetch failed (null)
				// Note: historicalBalanceSats can be 0 (valid - means balance was 0), but null means fetch failed
				if (historicalBalanceSats === null || historicalPrice === null) {
					console.warn(`[BalanceCard] ${period.label}: Could not calculate comparison:`, {
						historicalBalanceSats,
						historicalPrice
					});
					return {
						label: period.label,
						satsChange: null,
						usdChange: null,
						satsPercentChange: null,
						usdPercentChange: null
					};
				}
				
				return calculatePeriodComparison(
					period,
					historicalBalanceSats,
					historicalPrice,
					totalSats,
					totalUsdValue,
					targetTimestamp
				);
			} catch (error) {
				console.error(`[BalanceCard] ${period.label} period error:`, error);
				return {
					label: period.label,
					satsChange: null,
					usdChange: null,
					satsPercentChange: null,
					usdPercentChange: null
				};
			}
		}));
		const periodsDuration = performance.now() - periodsStart;
		const overallDuration = performance.now() - overallStartTime;
		
		console.log(`[BalanceCard] [TIMING] All periods processed: ${periodsDuration.toFixed(2)}ms`);
		console.log(`[BalanceCard] [TIMING] ========== TOTAL CALCULATION TIME: ${overallDuration.toFixed(2)}ms (${(overallDuration / 1000).toFixed(2)}s) ==========`);
		console.log('[BalanceCard] ========== Balance comparison calculation complete ==========');
		balanceChanges = results as typeof balanceChanges;
		isCalculatingBalanceChanges = false;
		// Note: lastCalculatedSats and lastCalculatedUsd are already set in the $effect to prevent retriggering
	}

	// Update balance changes when balance changes
	// Note: Transactions are no longer used for balance calculations, only blockchain API
	$effect(() => {
		// React to balance changes only
		totalSats;
		totalUsdValue;
		
		// Skip if already calculating or if data isn't ready
		if (isCalculatingBalanceChanges || $isAssetsLoading || isRefreshing || totalSats === undefined || totalUsdValue === undefined) {
			return;
		}
		
		// Skip if balance is 0 (nothing to compare)
		if (totalSats === 0) {
			return;
		}
		
		// Skip if values haven't changed (prevent infinite loop)
		if (lastCalculatedSats === totalSats && lastCalculatedUsd === totalUsdValue) {
			return;
		}
		
		// Capture current values before async call
		const currentSats = totalSats;
		const currentUsd = totalUsdValue;
		
		// Update last calculated values immediately to prevent retriggering
		lastCalculatedSats = currentSats;
		lastCalculatedUsd = currentUsd;
		
		// Call async function without tracking (prevents infinite loop)
		// updateBalanceChanges() will set isCalculatingBalanceChanges internally
		untrack(() => {
			updateBalanceChanges().catch(error => {
				console.error('[BalanceCard] Error in updateBalanceChanges:', error);
				isCalculatingBalanceChanges = false;
				// Reset last calculated values on error so it can retry
				lastCalculatedSats = undefined;
				lastCalculatedUsd = undefined;
			});
		});
	});

	function showBalances() {
		balancesHidden = false;
		countdownSeconds = 15;
		
		// Clear existing interval if any
		if (countdownInterval) {
			clearInterval(countdownInterval);
		}
		
		// Start countdown
		countdownInterval = setInterval(() => {
			countdownSeconds--;
			if (countdownSeconds <= 0) {
				hideBalances();
			}
		}, 1000);
	}

	function hideBalances() {
		balancesHidden = true;
		countdownSeconds = 0;
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	}

	function toggleBalances() {
		if (balancesHidden) {
			showBalances();
		} else {
			hideBalances();
		}
	}

	onDestroy(() => {
		if (countdownInterval) {
			clearInterval(countdownInterval);
		}
	});

	async function handleRefresh() {
		if (isRefreshing) return;

		isRefreshing = true;
		try {
			await walletManager.loadAssets();
			appStore.showSuccessToast($t('wallet.balance_refreshed'));
		} catch (error) {
			console.error('Failed to refresh balances:', error);
			appStore.showErrorToast($t('wallet.refresh_failed'));
		} finally {
			isRefreshing = false;
		}
	}
</script>

<div class="space-y-4 flex flex-col h-full overflow-y-auto">
	<!-- Total Portfolio Value Card -->
	<div class="card bg-primary relative bg-linear-to-br text-white shadow-xl rounded-lg">
		<div class="card-body p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1 min-h-[80px]">
					<p class="card-title text-white">{$t('wallet.total_balance')}</p>

					{#if $isAssetsLoading || isRefreshing}
						<!-- Loading state with reserved space -->
						<div class="flex items-center gap-2">
							<span class="loading loading-spinner loading-md"></span>
							<p class="text-2xl font-bold text-white opacity-70">
								{isRefreshing ? $t('wallet.rsk.refreshing') : $t('wallet.page.initializing')}
							</p>
						</div>
						<!-- USD field with spinner -->
						<p class="mt-1 text-white opacity-80 text-lg flex items-center">
							<span class="loading loading-spinner loading-sm ml-1"></span>
						</p>
					{:else if balancesHidden}
						<!-- Hidden balances state -->
						<p class="text-3xl font-bold text-white">
							•••••• {$t('wallet.sats')}
						</p>
						<p class="mt-1 text-white opacity-80 text-lg">
							≈ $•••••• {$t('wallet.usd')}
						</p>
					{:else if totalSats > 0}
						<!-- Show total sats -->
						<p class="text-3xl font-bold text-white">
							{formatSats(totalSats)} {$t('wallet.sats')}
						</p>

						{#if totalUsdValue > 0}
							<p class="mt-1 text-white opacity-80 text-lg">
								≈ ${totalUsdValue.toFixed(2)} {$t('wallet.usd')}
							</p>
						{:else}
							<!-- Show $0.00 to avoid layout shift when no assets -->
							<p class="mt-1 text-white opacity-80 text-lg">
								≈ $0.00 {$t('wallet.usd')}
							</p>
						{/if}
					{:else}
						<!-- Confirmed no assets - show 0 sats and $0.00 USD to avoid layout shift -->
						<p class="text-3xl font-bold text-white">
							0 {$t('wallet.sats')}
						</p>
						<p class="mt-1 text-white opacity-80 text-lg">
							≈ $0.00 {$t('wallet.usd')}
						</p>
					{/if}
				</div>
			</div>
		</div>
		<!-- Hide/Show Balances Toggle Button (Upper Right) -->
		<button
			class="absolute top-2 right-2 rounded-full p-2 bg-base-100 text-base-content shadow-2xl border-2 border-base-content/20 hover:bg-base-200 hover:shadow-3xl hover:scale-110 active:scale-95 transition-all duration-200 flex items-center gap-1"
			onclick={toggleBalances}
			aria-label={balancesHidden ? $t('wallet.show_balances') : $t('wallet.hide_balances')}
		>
			{#if balancesHidden}
				<IconEyeOff class="h-5 w-5" />
			{:else}
				<IconEye class="h-5 w-5" />
				{#if countdownSeconds > 0}
					<span class="text-xs font-semibold">{countdownSeconds}s</span>
				{/if}
			{/if}
		</button>
		<!-- Refresh Button (Lower Right) -->
		<button
			class="absolute bottom-2 right-2 rounded-full p-2 bg-base-100 text-base-content shadow-2xl border-2 border-base-content/20 hover:bg-base-200 hover:shadow-3xl hover:scale-110 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-2xl"
			onclick={handleRefresh}
			disabled={isRefreshing}
			aria-label={$t('wallet.refresh_balance')}
		>
			<IconRefresh class={isRefreshing ? 'h-5 w-5 animate-spin' : 'h-5 w-5'} />
		</button>
	</div>

	<!-- Historical Balance Indicators Card -->
	<div class="border-2 border-primary rounded-lg bg-base-100">
		<div class="py-3 px-4">
			<div class="grid grid-cols-3 gap-2 text-sm">
				{#each balanceChanges as change}
					<div class="flex flex-col items-center gap-1">
						<div class="text-base-content/70 font-medium">{change.label}</div>
						{#if balancesHidden}
							<div class="text-base-content/50">••••</div>
							<div class="text-base-content/50">••••</div>
						{:else if isCalculatingBalanceChanges || change.satsChange === null}
							<!-- Loading indicator -->
							<div class="flex flex-col items-center gap-1">
								<span class="loading loading-spinner loading-xs text-primary"></span>
								<span class="text-base-content/50 text-xs">{$t('common.loading')}</span>
							</div>
						{:else}
							{@const satsChange = change.satsChange ?? 0}
							{@const usdChange = change.usdChange ?? 0}
							{@const isZero = satsChange === 0 && usdChange === 0}
							{@const isBelowThreshold = Math.abs(usdChange) < 0.01}
							{@const isNeutral = isZero || isBelowThreshold}
							{@const isPositive = satsChange > 0 && !isNeutral}
							{@const formattedUsd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(usdChange))}
							{@const satsDisplay = isNeutral ? `${formatSats(Math.abs(satsChange))}` : (satsChange > 0 ? `+${formatSats(Math.abs(satsChange))}` : `-${formatSats(Math.abs(satsChange))}`)}
							{@const usdDisplay = isNeutral ? `$${formattedUsd}` : (usdChange > 0 ? `+$${formattedUsd}` : `-$${formattedUsd}`)}
							<div class="font-semibold {isNeutral ? 'text-base-content' : (isPositive ? 'text-success' : 'text-error')}">
								{satsDisplay} {$t('wallet.sats')}
							</div>
							<div class="text-base-content/70 {isNeutral ? '' : (isPositive ? 'text-success/80' : 'text-error/80')}">
								{usdDisplay}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Network Breakdown -->
	<div class="space-y-4">
		<!-- Bitcoin Accordion -->
		{#if true}
			{@const bitcoinAssets = $allAssets.filter((a: WalletAsset) => a.assetId === 'rbtc')}
			{@const bitcoinTotalSats = bitcoinAssets.reduce((sum: number, asset: WalletAsset) => sum + Math.floor(asset.balance * 100_000_000), 0)}
			{@const bitcoinTotalUsd = bitcoinAssets.reduce((sum: number, asset: WalletAsset) => sum + (asset.usdValue || 0), 0)}
			<div class="collapse collapse-arrow border-2 border-primary rounded-lg bg-base-100" class:collapse-open={bitcoinExpanded}>
			<button
				type="button"
				class="collapse-title min-h-0 py-3 px-4 pr-12 font-medium text-left flex items-center justify-between"
				onclick={() => {
					bitcoinExpanded = !bitcoinExpanded;
				}}
			>
				<div class="flex items-center gap-2 flex-1 min-w-0">
					<img src="/images/chains/Bitcoin.svg" alt="Bitcoin" class="h-6 w-6 shrink-0" />
					<span>{$t('wallet.bitcoin')}</span>
					<div
						class="btn btn-ghost btn-xs p-1 ml-2 cursor-pointer shrink-0"
						role="button"
						tabindex="0"
						onclick={(e) => {
							e.stopPropagation();
							(document.querySelector('[data-help-modal]') as HTMLButtonElement)?.click();
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								e.stopPropagation();
								(document.querySelector('[data-help-modal]') as HTMLButtonElement)?.click();
							}
						}}
					>
						<IconHelpCircle class="text-base-content/70 hover:text-base-content h-5 w-5" />
					</div>
				</div>
				<div class="text-right shrink-0 ml-2">
					{#if $isAssetsLoading || isRefreshing}
						<span class="loading loading-spinner loading-sm"></span>
					{:else if balancesHidden}
						<div class="font-semibold">
							•••••• {$t('wallet.sats')}
						</div>
						<div class="text-xs opacity-70">
							$••••••
						</div>
					{:else}
						<div class="font-semibold">
							{formatSats(bitcoinTotalSats)} {$t('wallet.sats')}
						</div>
						{#if bitcoinTotalUsd > 0}
							<div class="text-xs opacity-70">
								${bitcoinTotalUsd.toFixed(2)}
							</div>
						{/if}
					{/if}
				</div>
			</button>
			<div class="collapse-content">
				<div class="space-y-2 pb-2 px-4">
					<!-- L2 BTC Entry with Lightning Bolt Icon -->
					{#if bitcoinAssets.length > 0}
						{#each bitcoinAssets as asset (asset.assetId)}
							{@const balanceInSats = Math.floor(asset.balance * 100_000_000)}
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 text-yellow-500"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13 10V3L4 14h7v7l9-11h-7z"
										/>
									</svg>
									<span class="font-medium">{$t('wallet.l2_btc')}</span>
								</div>
								<div class="text-right">
									{#if balancesHidden}
										<div class="font-semibold">
											•••••• {$t('wallet.sats')}
										</div>
										<div class="text-xs opacity-70">
											$••••••
										</div>
									{:else}
										<div class="font-semibold">
											{formatSats(balanceInSats)} {$t('wallet.sats')}
										</div>
										{#if asset.usdValue > 0}
											<div class="text-xs opacity-70">
												${asset.usdValue.toFixed(2)}
											</div>
										{/if}
									{/if}
								</div>
							</div>
						{/each}
					{:else}
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5 text-yellow-500"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 10V3L4 14h7v7l9-11h-7z"
									/>
								</svg>
								<span class="font-medium">{$t('wallet.l2_btc')}</span>
							</div>
							<div class="text-right">
								<div class="font-semibold">0 {$t('wallet.sats')}</div>
							</div>
						</div>
					{/if}

					<!-- BTC Entry (Coming Soon) -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-5 w-5 opacity-50" />
							<span class="text-base-content/50 font-medium">{$t('wallet.btc')}</span>
						</div>
						<div class="text-right">
							<span class="text-base-content/50 font-semibold">{$t('wallet.coming_soon')}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
		{/if}

		<!-- USD Accordion -->
		{#if true}
			{@const usdAssets = $allAssets.filter((a: WalletAsset) => a.assetId === 'usdt' || a.assetId === 'bnb')}
			{@const usdTotal = usdAssets.reduce((sum: number, asset: WalletAsset) => sum + (asset.usdValue || 0), 0)}
			<div class="collapse collapse-arrow border-2 border-primary rounded-lg bg-base-100 opacity-50" class:collapse-open={usdExpanded}>
			<button
				type="button"
				class="collapse-title min-h-0 py-3 px-4 pr-12 font-medium text-left flex items-center justify-between"
				onclick={() => {
					usdExpanded = !usdExpanded;
				}}
			>
				<div class="flex items-center gap-2 flex-1 min-w-0">
					<img src="/images/chains/Tether-USD.svg" alt="USD" class="h-6 w-6 shrink-0" />
					<span class="text-base-content/70">{$t('wallet.usd')}</span>
				</div>
				<div class="text-right shrink-0 ml-2">
					<div class="font-semibold text-base-content/70">
						{$t('wallet.coming_soon')}
					</div>
				</div>
			</button>
			<div class="collapse-content">
				<div class="space-y-2 pb-2 px-2">
					<div class="flex items-center gap-2">
						<img
							src="/images/chains/Binance-logo.svg"
							alt="USDT (Binance Chain)"
							class="h-5 w-5 opacity-50"
						/>
						<span class="text-base-content/50 font-medium">{$t('wallet.usdt_binance_chain')}</span>
						<div class="text-base-content/50 ml-auto text-xs">
							{#if balancesHidden}
								$••••••
							{:else}
								${parseFloat($walletStore.bsc.formattedUsdtBalance || '0').toFixed(2)}
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						<img src="/images/chains/Tether-USD.svg" alt="USDT" class="h-5 w-5 opacity-50" />
						<span class="text-base-content/50 font-medium">{$t('wallet.usdt_liquid')}</span>
						<div class="text-base-content/50 ml-auto text-xs">
							{#if balancesHidden}
								$••••••
							{:else}
								$0.00
							{/if}
						</div>
					</div>
					<div class="mt-4 text-center">
						<p class="text-base-content/50 font-bold">{$t('wallet.coming_soon')}</p>
					</div>
				</div>
			</div>
		</div>
		{/if}
	</div>

	<!-- Transactions Button -->
	<div>
		<button
			type="button"
			class="collapse-title min-h-0 py-3 px-4 pr-12 font-medium text-left flex items-center justify-between w-full border-2 border-primary rounded-lg bg-base-100 hover:bg-base-200 transition-colors"
			onclick={() => {
				if (onTransactions) {
					onTransactions();
				} else {
					walletManager.setActiveTab('transactions');
				}
			}}
		>
			<div class="flex items-center gap-2 flex-1 min-w-0">
				<IconFormatListBulleted class="h-5 w-5 shrink-0" />
				<span>{$t('wallet.tab_transactions')}</span>
			</div>
			<div class="absolute right-3 flex items-center">
				<IconChevronRight class="h-6 w-6 shrink-0" />
			</div>
		</button>
	</div>

	<!-- Spacer to push buttons to bottom -->
	<div class="flex-1"></div>

	<!-- Learn More Section - Above buttons on mobile/tablet -->
	<div class="mt-4 md:hidden flex justify-center">
		<div class="text-base-content/70 text-sm">
			<HelpModal />
		</div>
	</div>

	<!-- Send and Receive Buttons -->
	<div class="mt-4 flex flex-col sm:flex-row gap-4">
		<button
			class="btn btn-secondary flex-1 py-3 order-1 sm:order-2"
			onclick={() => {
				if (onSend) {
					onSend();
				} else {
					walletManager.setActiveTab('send');
				}
			}}
		>
			<IconUpload class="mr-2 h-5 w-5" />
			{$t('wallet.send_button')}
		</button>
		<button
			class="btn btn-primary flex-1 py-3 order-2 sm:order-1"
			onclick={() => {
				if (onReceive) {
					onReceive();
				} else {
					walletManager.setActiveTab('receive');
				}
			}}
		>
			<IconDownload class="mr-2 h-5 w-5" />
			{$t('wallet.tab_receive')}
		</button>
	</div>

	<!-- Learn More Section - Below buttons on desktop -->
	<div class="mt-6 hidden md:flex justify-center">
		<div class="text-base-content/70 text-sm">
			<HelpModal />
		</div>
	</div>

	<!-- Recent Activity Summary -->
	<!-- <div class="card bg-base-200">
		<div class="card-body">
			<h4 class="mb-4 font-semibold">{$t('wallet.recent_transactions')}</h4>

			<div class="py-8 text-center opacity-70">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mx-auto mb-2 h-12 w-12"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1"
						d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
					/>
				</svg>
				<p>{$t('wallet.no_transactions')}</p>
				<p class="mt-1 text-xs">{$t('wallet.view_all_transactions_tab')}</p>
			</div>
		</div>
	</div> -->
</div>

