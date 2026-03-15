import { ethers, type ContractInterface } from 'ethers';
import type { AbiLoadResult } from '$lib/types/escrow';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('escrow:loadAbi');

/**
 * Local cache for escrow contract ABIs
 * Maps chainId to cached ABI with timestamp
 */
const abiCache = new Map<number, { abi: ContractInterface; timestamp: number }>();

/**
 * ABI cache TTL in milliseconds (1 hour)
 */
const ABI_CACHE_TTL = 60 * 60 * 1000;

/**
 * Load escrow contract ABI from deployed contracts registry
 * This will be populated after contract deployment
 *
 * @param chainId - Blockchain chain ID (97 for BSC testnet, 56 for mainnet)
 * @returns Contract ABI if available from registry, null if not deployed yet
 */
async function loadDeployedContractAbi(chainId: number): Promise<ContractInterface | null> {
	try {
		// Stage 1: Try to import from deployment registry
		// This path exists after contract deployment
		const deploymentRegistry = await import('$lib/utils/constants/escrowDeployment');
		const deployment = deploymentRegistry.ESCROW_DEPLOYMENTS[chainId];

		if (!deployment || !deployment.abi) {
			d.warn('Escrow contract not found in deployment registry', { chainId });
			return null;
		}

		d.log('Loaded ABI from deployed contracts registry', { chainId });
		return deployment.abi;
	} catch (error) {
		// Registry not available or import failed - this is expected pre-deployment
		d.debug('Deployment registry not available', { chainId });
		return null;
	}
}

/**
 * Load escrow contract ABI from local cache
 *
 * @param chainId - Blockchain chain ID
 * @returns Cached ABI if available and not expired, null otherwise
 */
function loadCachedAbi(chainId: number): ContractInterface | null {
	const cached = abiCache.get(chainId);
	if (!cached) {
		return null;
	}

	// Check if cache is expired
	const age = Date.now() - cached.timestamp;
	if (age > ABI_CACHE_TTL) {
		d.log('ABI cache expired', { chainId, ageMs: age });
		abiCache.delete(chainId);
		return null;
	}

	d.log('Loaded ABI from local cache', { chainId, ageMs: age });
	return cached.abi;
}

/**
 * Store ABI in local cache
 *
 * @param chainId - Blockchain chain ID
 * @param abi - Contract ABI to cache
 */
function cacheAbi(chainId: number, abi: ContractInterface): void {
	abiCache.set(chainId, {
		abi,
		timestamp: Date.now()
	});
	d.log('Cached ABI for chain', { chainId });
}

/**
 * Load escrow contract ABI for BSC
 *
 * FAIL-CLOSED: Returns null if ABI is not available. This is intentional to prevent
 * escrow creation without verified contract interface.
 *
 * Loading strategy:
 * 1. Try to load from deployed contracts registry (post-deployment)
 * 2. Try to load from local cache
 * 3. Return null if not available (fail-closed)
 *
 * @param chainId - Blockchain chain ID (97 for testnet, 56 for mainnet)
 * @returns ContractInterface if ABI is available, null if not (fail-closed)
 *
 * @example
 * const abi = await loadEscrowContractAbi(97); // BSC testnet
 * if (!abi) {
 *   // Handle missing ABI - don't bypass, don't fallback
 *   throw new Error('Escrow contract ABI not available for this network');
 * }
 */
export async function loadEscrowContractAbi(chainId: number): Promise<ContractInterface | null> {
	try {
		// Stage 1: Try to load from deployed contracts registry
		const deployedAbi = await loadDeployedContractAbi(chainId);
		if (deployedAbi) {
			cacheAbi(chainId, deployedAbi);
			return deployedAbi;
		}

		// Stage 2: Try to load from local cache
		const cachedAbi = loadCachedAbi(chainId);
		if (cachedAbi) {
			return cachedAbi;
		}

		// Stage 3: Return null if not available (FAIL-CLOSED)
		d.warn('Escrow ABI not available for chain', { chainId });
		return null;
	} catch (error) {
		d.error('Error loading escrow ABI', { chainId }, error);
		return null;
	}
}

/**
 * Clear ABI cache for a specific chain or all chains
 * Useful for testing or forcing ABI reload
 *
 * @param chainId - Optional chain ID. If not provided, clears all caches.
 */
export function clearAbiCache(chainId?: number): void {
	if (chainId !== undefined) {
		abiCache.delete(chainId);
		d.log('Cleared ABI cache for chain', { chainId });
	} else {
		abiCache.clear();
		d.log('Cleared all ABI caches');
	}
}

/**
 * Get cache statistics for debugging
 *
 * @returns Object with cache size and cached chain IDs
 */
export function getAbiCacheStats(): { size: number; chainIds: number[] } {
	return {
		size: abiCache.size,
		chainIds: Array.from(abiCache.keys())
	};
}
