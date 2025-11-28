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
	console.log('[DEBUG] loadContractsByAddress called', {
		walletAddress,
		limit,
		network,
		timestamp: new Date().toISOString()
	});

	try {
		// Ensure escrow contract is ready for the specified network
		console.log(`[DEBUG] Ensuring escrow contract is ready for ${network} network...`);
		
		// For now, escrow.ensureEscrowReady() only supports RSK
		// TODO: Add BSC support when multi-network escrow is implemented
		if (network === 'BSC') {
			console.warn('[DEBUG] BSC network requested but not yet supported. Only RSK contracts will be loaded.');
			// For now, return empty array for BSC until multi-network support is added
			return [];
		}
		
		const { contract } = await escrow.ensureEscrowReady();
		if (!contract) {
			console.error('[DEBUG] Escrow contract not available');
			throw new Error('Contract not available');
		}
		console.log('[DEBUG] Escrow contract ready', {
			network,
			contractAddress: contract.target
		});

		// Get total number of escrows
		let nextEscrowId: bigint;
		try {
			console.log('[DEBUG] Fetching nextEscrowId...');
			nextEscrowId = await contract.nextEscrowId();
			console.log('[DEBUG] nextEscrowId:', nextEscrowId.toString());
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

		// Load contracts in batches to avoid overwhelming the RPC
		let checkedCount = 0;
		let foundCount = 0;
		let errorCount = 0;

		for (let i = startId; i < totalEscrows; i++) {
			checkedCount++;
			try {
				const escrowData = await escrow.getEscrow(i.toString());
				if (escrowData) {
					// Check if user is client or freelancer
					const clientAddr = escrowData.client.toLowerCase();
					const freelancerAddr = escrowData.freelancer.toLowerCase();

					console.log(`[DEBUG] Escrow ${i} details`, {
						escrowId: escrowData.id,
						client: escrowData.client,
						freelancer: escrowData.freelancer,
						clientMatches: clientAddr === normalizedAddress,
						freelancerMatches: freelancerAddr === normalizedAddress,
						status: escrowData.status,
						baseAmount: escrowData.baseAmount
					});

					if (clientAddr === normalizedAddress || freelancerAddr === normalizedAddress) {
						console.log(`[DEBUG] ✓ Found matching contract: ${escrowData.id}`);
						contracts.push(escrowData);
						foundCount++;
					}
				} else {
					console.log(`[DEBUG] Escrow ${i} returned null/undefined`);
				}
			} catch (error) {
				// Skip failed escrows (might be non-existent IDs)
				errorCount++;
				console.warn(`[DEBUG] Failed to load escrow ${i}:`, error);
				continue;
			}
		}

		console.log('[DEBUG] Contract loading summary', {
			checkedCount,
			foundCount,
			errorCount,
			totalContracts: contracts.length,
			contractIds: contracts.map(c => c.id)
		});

		return contracts;
	} catch (error) {
		console.error('[DEBUG] Failed to load contracts for address', {
			walletAddress,
			error: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined
		});
		throw new Error(
			`Failed to load contracts: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

