import type { EscrowData } from '$lib/types/wallet';
import { escrow } from './escrow';
import { ethers } from 'ethers';
import { get } from 'svelte/store';
import { walletStore, getWallet, getProvider } from '$lib/stores/wallet.store';

/**
 * Load all smart contracts for a given wallet address
 * @param walletAddress - The wallet address to query contracts for
 * @param limit - Maximum number of recent contracts to check (default: 100)
 * @param network - Network to query ('RSK' or 'BSC', defaults to 'RSK')
 * @returns Array of EscrowData for contracts where the user is client or freelancer
 */
export async function loadContractsByAddress(
	walletAddress: string,
	limit: number = 100,
	network: 'RSK' | 'BSC' = 'RSK'
): Promise<EscrowData[]> {
	const functionStartTime = performance.now();
	console.log('[DEBUG] loadContractsByAddress called', {
		walletAddress,
		limit,
		network,
		timestamp: new Date().toISOString()
	});

	try {
		// Ensure escrow contract is ready for the specified network
		const ensureStartTime = performance.now();
		console.log(`[DEBUG] Ensuring escrow contract is ready for ${network} network...`);
		
		// For now, escrow.ensureEscrowReady() only supports RSK
		// TODO: Add BSC support when multi-network escrow is implemented
		if (network === 'BSC') {
			console.warn('[DEBUG] BSC network requested but not yet supported. Only RSK contracts will be loaded.');
			// For now, return empty array for BSC until multi-network support is added
			return [];
		}
		
		const { contract } = await escrow.ensureEscrowReady();
		const ensureEndTime = performance.now();
		const ensureDuration = ensureEndTime - ensureStartTime;
		if (!contract) {
			console.error('[DEBUG] Escrow contract not available');
			throw new Error('Contract not available');
		}
		console.log('[DEBUG] Escrow contract ready', {
			network,
			contractAddress: contract.target,
			durationMs: ensureDuration.toFixed(2)
		});

		// Get total number of escrows with retry logic for destroyed provider
		let nextEscrowId: bigint;
		try {
			const nextIdStartTime = performance.now();
			console.log('[DEBUG] Fetching nextEscrowId...');
			try {
				nextEscrowId = await contract.nextEscrowId();
			} catch (error: any) {
				// Check if error is due to destroyed provider
				if (error?.code === 'UNSUPPORTED_OPERATION' && error?.message?.includes('provider destroyed')) {
					console.warn('[DEBUG] Provider destroyed during nextEscrowId call, resetting contract and retrying...');
					// Reset cached contract and retry
					escrow.resetCachedContract();
					const { contract: retryContract } = await escrow.ensureEscrowReady();
					if (!retryContract) {
						throw new Error('Failed to get contract after reset');
					}
					nextEscrowId = await retryContract.nextEscrowId();
				} else {
					throw error;
				}
			}
			const nextIdEndTime = performance.now();
			const nextIdDuration = nextIdEndTime - nextIdStartTime;
			console.log('[DEBUG] nextEscrowId:', {
				value: nextEscrowId.toString(),
				durationMs: nextIdDuration.toFixed(2)
			});
		} catch (error) {
			console.error('[DEBUG] Failed to get nextEscrowId:', error);
			return [];
		}

		const contracts: EscrowData[] = [];
		const totalEscrows = Number(nextEscrowId);

		// Load recent escrows (last N to avoid too many calls)
		const startId = Math.max(0, totalEscrows - limit);
		const normalizedAddress = walletAddress.toLowerCase();

		console.log('[DEBUG] Contract loading parameters', {
			totalEscrows,
			startId,
			endId: totalEscrows - 1,
			range: `${startId} to ${totalEscrows - 1}`,
			normalizedAddress,
			originalAddress: walletAddress
		});

		// Load contracts in parallel batches to avoid overwhelming the RPC
		const batchSize = 20; // Conservative batch size to respect RPC rate limits
		let checkedCount = 0;
		let foundCount = 0;
		let errorCount = 0;
		const escrowFetchStartTime = performance.now();
		const escrowFetchTimes: number[] = [];
		const batchTimings: number[] = [];

		console.log('[DEBUG] Starting parallel batch processing', {
			totalEscrowsToCheck: totalEscrows - startId,
			batchSize,
			estimatedBatches: Math.ceil((totalEscrows - startId) / batchSize)
		});

		// Process escrows in batches (batches run sequentially, items within batch run in parallel)
		for (let i = startId; i < totalEscrows; i += batchSize) {
			const batchStartTime = performance.now();
			const batch = [];
			const end = Math.min(i + batchSize, totalEscrows);
			const batchIndices: number[] = [];

			// Create promises for all escrows in this batch
			for (let j = i; j < end; j++) {
				batchIndices.push(j);
				batch.push(
					escrow.getEscrow(j.toString()).catch((err) => {
						// Return error info instead of throwing
						return { error: err, escrowId: j.toString() };
					})
				);
			}

			// Execute all requests in this batch in parallel
			const batchResults = await Promise.all(batch);
			const batchEndTime = performance.now();
			const batchDuration = batchEndTime - batchStartTime;
			batchTimings.push(batchDuration);

			console.log(`[DEBUG] Batch ${Math.floor(i / batchSize) + 1} completed`, {
				startId: i,
				endId: end - 1,
				batchSize: batchResults.length,
				batchDurationMs: batchDuration.toFixed(2),
				avgTimePerEscrowMs: (batchDuration / batchResults.length).toFixed(2)
			});

			// Process results from this batch
			for (let k = 0; k < batchResults.length; k++) {
				checkedCount++;
				const escrowId = batchIndices[k];
				const result = batchResults[k];

				// Check if result is an error
				if (result && 'error' in result) {
					errorCount++;
					console.warn(`[DEBUG] Failed to load escrow ${escrowId}:`, {
						error: result.error,
						batchIndex: k
					});
					continue;
				}

				const escrowData = result as EscrowData | null;
				const escrowFetchDuration = batchDuration / batchResults.length; // Approximate per-escrow time
				escrowFetchTimes.push(escrowFetchDuration);

				if (escrowData) {
					// Check if user is client or freelancer
					const clientAddr = escrowData.client.toLowerCase();
					const freelancerAddr = escrowData.freelancer.toLowerCase();

					console.log(`[DEBUG] Escrow ${escrowId} details`, {
						escrowId: escrowData.id,
						client: escrowData.client,
						freelancer: escrowData.freelancer,
						clientMatches: clientAddr === normalizedAddress,
						freelancerMatches: freelancerAddr === normalizedAddress,
						status: escrowData.status,
						baseAmount: escrowData.baseAmount,
						batchIndex: k
					});

					if (clientAddr === normalizedAddress || freelancerAddr === normalizedAddress) {
						console.log(`[DEBUG] ✓ Found matching contract: ${escrowData.id}`);
						contracts.push(escrowData);
						foundCount++;
					}
				} else {
					console.log(`[DEBUG] Escrow ${escrowId} returned null/undefined`, {
						batchIndex: k
					});
				}
			}
		}

		const escrowFetchEndTime = performance.now();
		const totalEscrowFetchTime = escrowFetchEndTime - escrowFetchStartTime;
		const avgEscrowFetchTime = escrowFetchTimes.length > 0 
			? escrowFetchTimes.reduce((a, b) => a + b, 0) / escrowFetchTimes.length 
			: 0;
		const minEscrowFetchTime = escrowFetchTimes.length > 0 ? Math.min(...escrowFetchTimes) : 0;
		const maxEscrowFetchTime = escrowFetchTimes.length > 0 ? Math.max(...escrowFetchTimes) : 0;
		const avgBatchTime = batchTimings.length > 0
			? batchTimings.reduce((a, b) => a + b, 0) / batchTimings.length
			: 0;
		const totalBatchTime = batchTimings.reduce((a, b) => a + b, 0);
		
		// Calculate estimated sequential time for comparison
		const estimatedSequentialTime = avgEscrowFetchTime * checkedCount;

		console.log('[DEBUG] Contract loading summary', {
			checkedCount,
			foundCount,
			errorCount,
			totalContracts: contracts.length,
			contractIds: contracts.map(c => c.id),
			timing: {
				totalEscrowFetchTimeMs: totalEscrowFetchTime.toFixed(2),
				totalBatchTimeMs: totalBatchTime.toFixed(2),
				avgBatchTimeMs: avgBatchTime.toFixed(2),
				avgEscrowFetchTimeMs: avgEscrowFetchTime.toFixed(2),
				minEscrowFetchTimeMs: minEscrowFetchTime.toFixed(2),
				maxEscrowFetchTimeMs: maxEscrowFetchTime.toFixed(2),
				estimatedSequentialTimeMs: estimatedSequentialTime.toFixed(2),
				timeSavedMs: (estimatedSequentialTime - totalEscrowFetchTime).toFixed(2),
				performanceImprovement: `${((1 - totalEscrowFetchTime / estimatedSequentialTime) * 100).toFixed(1)}%`,
				note: 'Parallel batch processing enabled'
			}
		});

		const functionEndTime = performance.now();
		const totalFunctionTime = functionEndTime - functionStartTime;
		console.log('[DEBUG] loadContractsByAddress completed', {
			totalDurationMs: totalFunctionTime.toFixed(2),
			contractsFound: contracts.length
		});

		return contracts;
	} catch (error) {
		const functionEndTime = performance.now();
		const totalFunctionTime = functionEndTime - functionStartTime;
		console.error('[DEBUG] Failed to load contracts for address', {
			walletAddress,
			error: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined,
			totalDurationMs: totalFunctionTime.toFixed(2)
		});
		throw new Error(
			`Failed to load contracts: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

