import type { EscrowData } from '$lib/types/wallet';
import { get } from 'svelte/store';
import { walletStore } from '$lib/stores/wallet.store';
import { escrow } from '../escrow/v1/escrow';
import { escrow as escrowManager } from '../escrow';
import {
	normalizePaymentAsset,
	normalizePaymentNetwork
} from '$lib/utils/helpers/paymentContext';
import { callContractMethod } from './rpcHelpers';

function isEvmAddress(value?: string | null): value is string {
	return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

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
	try {
		const normalizedAddress = walletAddress.toLowerCase();

		if (network === 'BSC') {
			const connectedBscAddress = get(walletStore).bsc.address?.trim() ?? null;
			const normalizedConnectedBscAddress = connectedBscAddress?.toLowerCase() ?? null;

			if (normalizedConnectedBscAddress && normalizedConnectedBscAddress !== normalizedAddress) {
				return [];
			}

			const resolvedConnectedAddress = connectedBscAddress ?? walletAddress;
			const contracts = await escrowManager.contractOps.getContracts({ limit });

			return contracts
				.flatMap((contract) => {
					const paymentAsset = normalizePaymentAsset(
						contract.contractEvent.content.paymentAsset ??
							contract.contractEvent.content.currency ??
							'RBTC'
					);
					const paymentNetwork = normalizePaymentNetwork(
						contract.contractEvent.content.paymentNetwork,
						paymentAsset
					);

					if (!paymentNetwork.startsWith('bsc')) {
						return [];
					}

					const { client, freelancer } = contract.escrowData;
					const hasEvmParticipant =
						isEvmAddress(contract.escrowData.client) || isEvmAddress(contract.escrowData.freelancer);

					if (hasEvmParticipant) {
						const matchesClient = isEvmAddress(client) && client.toLowerCase() === normalizedAddress;
						const matchesFreelancer =
							isEvmAddress(freelancer) && freelancer.toLowerCase() === normalizedAddress;

						if (!matchesClient && !matchesFreelancer) {
							return [];
						}

						return [contract.escrowData];
					}

					return [
						{
							...contract.escrowData,
							client: contract.isClient
								? resolvedConnectedAddress
								: contract.escrowData.client,
							freelancer: contract.isClient
								? contract.escrowData.freelancer
								: resolvedConnectedAddress
						}
					];
				});
		}

		// Read-only operations don't require balance - pass requireBalance: false
		const { contract } = await escrow.ensureEscrowReady(undefined, false);
		if (!contract) {
			throw new Error('Contract not available');
		}

		// Get total number of escrows with timeout (no retries - errors will be shown to user)
		let nextEscrowId: bigint;
		try {
			// Use retry logic with timeout for contract calls
			nextEscrowId = await callContractMethod<bigint>(
				contract,
				'nextEscrowId',
				[],
				{
					maxRetries: 0, // Disabled retries - show error to user instead
					timeoutMs: 30000, // 30 second timeout
					initialDelayMs: 1000
				}
			);
		} catch {
			// Return empty array for graceful degradation on RPC errors
			// This allows the UI to continue functioning even if nextEscrowId fails
			return [];
		}

		const contracts: EscrowData[] = [];
		const totalEscrows = Number(nextEscrowId);

		// Load recent escrows (last N to avoid too many calls)
		const startId = Math.max(0, totalEscrows - limit);
		// Load contracts in parallel batches to avoid overwhelming the RPC
		const batchSize = 20; // Conservative batch size to respect RPC rate limits

		// Process escrows in batches (batches run sequentially, items within batch run in parallel)
		for (let i = startId; i < totalEscrows; i += batchSize) {
			const batch = [];
			const end = Math.min(i + batchSize, totalEscrows);
			const batchIndices: number[] = [];

			// Create promises for all escrows in this batch
			// Each call will have its own retry logic and timeout via escrow.loadEscrowDetails
			for (let j = i; j < end; j++) {
				batchIndices.push(j);
				batch.push(
					escrow.loadEscrowDetails(j.toString()).catch((err: unknown) => {
						// Return error info instead of throwing
						// This allows the batch to continue even if individual escrows fail
						return { error: err, escrowId: j.toString() };
					})
				);
			}

			// Execute all requests in this batch in parallel
			const batchResults = await Promise.all(batch);

			// Process results from this batch
			for (let k = 0; k < batchResults.length; k++) {
				const result = batchResults[k];

				// Check if result is an error
				if (result && 'error' in result) {
					continue;
				}

				const escrowData = result as EscrowData | null;

				if (escrowData && escrowData.client && escrowData.freelancer) {
					// Check if user is client or freelancer
					const clientAddr = escrowData.client.toLowerCase();
					const freelancerAddr = escrowData.freelancer.toLowerCase();

					if (clientAddr === normalizedAddress || freelancerAddr === normalizedAddress) {
						contracts.push(escrowData);
					}
				}
			}
		}

		return contracts;
	} catch (error) {
		throw new Error(
			`Failed to load contracts: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}
