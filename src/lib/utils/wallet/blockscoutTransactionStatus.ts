/**
 * Blockscout Transaction Status API
 * Fetches transaction status from Blockscout API for RSK/Rootstock networks
 */

import { getBlockscoutApiUrl as resolveBlockscoutApiUrl } from './explorerProxy';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('wallet:blockscout-tx-status');

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

	if (!apiUrl) {
		d.warn('No API URL available for network:', network);
		return null;
	}

	try {
		const url = `${apiUrl}/transactions/${txHash}`;
		d.log('Fetching tx status:', txHash);

		const response = await fetch(url, {
			signal: AbortSignal.timeout(5000)
		});

		if (!response.ok) {
			d.warn('API error: %s %s', response.status, response.statusText);
			return null;
		}

		const data = await response.json();

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

		d.log('Tx status: %s (confirmations: %d)', result.status, result.confirmations);
		return result;
	} catch (error) {
		d.error('Error fetching tx status:', error instanceof Error ? error.message : error);
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
