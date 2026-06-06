/**
 * Blockscout Transaction Status API
 * Fetches transaction status from Blockscout API for RSK/Rootstock networks
 */

import { getBlockscoutApiUrl as resolveBlockscoutApiUrl } from './explorerProxy';

export interface BlockscoutTransaction {
	hash: string;
	blockNumber: number | null;
	confirmations: number;
	status: number | null; // 1 = success, 0 = failed, null = pending
	timeStamp: string;
}

/**
 * Get Blockscout API URL for a network
 */
export function getBlockscoutApiUrl(network: string | null): string | null {
	if (!network) return null;

	if (network === 'rootstock-bitcoin' || network === 'rsk') {
		return resolveBlockscoutApiUrl();
	}

	return null;
}

/**
 * Fetch transaction status from Blockscout API
 *
 * @param txHash - Transaction hash
 * @param network - Network identifier ('rootstock-bitcoin' or 'rsk')
 * @returns Transaction status data or null if not found/error
 */
export async function fetchTransactionStatus(
	txHash: string,
	network: string
): Promise<BlockscoutTransaction | null> {
	const apiUrl = getBlockscoutApiUrl(network);

	console.log('[BlockscoutTransactionStatus] fetchTransactionStatus called', {
		txHash,
		network,
		apiUrl,
		timestamp: new Date().toISOString()
	});

	if (!apiUrl) {
		console.warn('[BlockscoutTransactionStatus] No API URL available for network:', network);
		return null;
	}

	try {
		const url = `${apiUrl}/transactions/${txHash}`;
		console.log('[BlockscoutTransactionStatus] Fetching from URL:', url);

		const fetchStartTime = Date.now();
		const response = await fetch(url, {
			signal: AbortSignal.timeout(5000)
		});
		const fetchDuration = Date.now() - fetchStartTime;

		console.log('[BlockscoutTransactionStatus] API response received', {
			status: response.status,
			statusText: response.statusText,
			ok: response.ok,
			duration: `${fetchDuration}ms`,
			timestamp: new Date().toISOString()
		});

		if (!response.ok) {
			console.warn(
				`[BlockscoutTransactionStatus] API error: ${response.status} ${response.statusText}`
			);
			return null;
		}

		const data = await response.json();
		console.log('[BlockscoutTransactionStatus] API response data:', {
			hasItems: !!data.items,
			itemsLength: data.items?.length,
			hasHash: !!data.hash,
			hasBlockNumber: !!(data.block_number ?? data.blockNumber),
			hasConfirmations: data.confirmations !== undefined,
			hasStatus: data.status !== undefined,
			rawData: data
		});

		// Handle different response formats
		// Blockscout API v2 might return the transaction directly or wrapped
		const transaction = data.items?.[0] || data;

		const result = {
			hash: transaction.hash || txHash,
			blockNumber: transaction.block_number ?? transaction.blockNumber ?? null,
			confirmations: transaction.confirmations ?? 0,
			status: transaction.status ?? null,
			timeStamp: transaction.timestamp ?? transaction.timeStamp ?? new Date().toISOString()
		};

		console.log('[BlockscoutTransactionStatus] Parsed transaction data:', {
			hash: result.hash,
			blockNumber: result.blockNumber,
			confirmations: result.confirmations,
			status: result.status,
			timeStamp: result.timeStamp
		});

		return result;
	} catch (error) {
		console.error('[BlockscoutTransactionStatus] Error fetching transaction status:', {
			error,
			errorMessage: error instanceof Error ? error.message : String(error),
			errorName: error instanceof Error ? error.name : 'Unknown',
			txHash,
			network,
			apiUrl,
			timestamp: new Date().toISOString()
		});
		return null;
	}
}

/**
 * Calculate estimated time remaining for transaction confirmation
 *
 * @param currentConfirmations - Current number of confirmations
 * @param targetConfirmations - Target number of confirmations needed
 * @param blockTimeSeconds - Average block time in seconds
 * @returns Estimated time remaining in seconds
 */
export function calculateEstimatedTime(
	currentConfirmations: number,
	targetConfirmations: number,
	blockTimeSeconds: number
): number {
	const confirmationsNeeded = Math.max(0, targetConfirmations - currentConfirmations);
	return confirmationsNeeded * blockTimeSeconds;
}
