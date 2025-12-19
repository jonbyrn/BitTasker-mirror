/**
 * Contract Detection Utility
 * 
 * Detects if an address is a contract and identifies contract interactions.
 * Uses multiple methods for reliable detection with fallbacks.
 */

import type { ethers } from 'ethers';
import { isKnownContract } from './contractRegistry';

type Network = 'rsk' | 'bsc';
type Environment = 'mainnet' | 'testnet';

interface ContractDetectionResult {
	isContract: boolean;
	isKnownContract: boolean;
	contractType: 'escrow' | 'etherSwap' | 'unknown' | null;
}

// Cache for contract code checks to avoid repeated RPC calls
const contractCodeCache = new Map<string, { isContract: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if an address is a contract by checking if it has code
 */
export async function isContractAddress(
	address: string,
	provider: ethers.Provider,
	blockNumber?: number
): Promise<boolean> {
	if (!address || address === '0x0000000000000000000000000000000000000000' || !provider) {
		return false;
	}

	const normalizedAddress = address.toLowerCase();
	const cacheKey = `${normalizedAddress}-${blockNumber || 'latest'}`;
	
	// Check cache
	const cached = contractCodeCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.isContract;
	}

	try {
		const code = await provider.getCode(address, blockNumber);
		const isContract = code && code !== '0x' && code.length > 2 ? true : false;
		
		// Cache result
		contractCodeCache.set(cacheKey, {
			isContract,
			timestamp: Date.now()
		});
		
		return isContract;
	} catch (error) {
		console.warn('[ContractDetection] Failed to check contract code:', error);
		return false;
	}
}

/**
 * Check if transaction has contract interaction by checking input data
 */
export function hasContractInteraction(inputData: string | undefined | null): boolean {
	if (!inputData || inputData === '0x' || inputData.length <= 2) {
		return false;
	}
	
	// If input data exists and is more than just "0x", it's likely a contract call
	// Value transfers typically have empty or minimal input data
	return inputData.length > 10; // At least "0x" + 4 bytes (function selector)
}

/**
 * Detect contract interaction from transaction data
 */
export async function detectContractInteraction(
	transaction: {
		to: string | null | undefined;
		from: string;
		input?: string | null;
	},
	provider: ethers.Provider | null,
	network: Network,
	environment: Environment,
	userAddress: string
): Promise<ContractDetectionResult> {
	const txTo = transaction.to?.toLowerCase();
	
	if (!txTo || txTo === '0x0000000000000000000000000000000000000000') {
		return {
			isContract: false,
			isKnownContract: false,
			contractType: null
		};
	}

	// First check if it's a known contract
	const knownContract = isKnownContract(txTo, network, environment);
	if (knownContract.isKnown) {
		return {
			isContract: true,
			isKnownContract: true,
			contractType: knownContract.contractType || 'unknown'
		};
	}

	// Check if transaction has input data (fallback method)
	if (hasContractInteraction(transaction.input)) {
		// Try to verify it's actually a contract if provider is available
		if (provider) {
			try {
				const isContract = await isContractAddress(txTo, provider);
				return {
					isContract,
					isKnownContract: false,
					contractType: isContract ? 'unknown' : null
				};
			} catch (error) {
				// Fall through to input data check
			}
		}
		
		// If we have input data, assume it's a contract interaction
		return {
			isContract: true,
			isKnownContract: false,
			contractType: 'unknown'
		};
	}

	// If provider is available, check contract code
	if (provider) {
		try {
			const isContract = await isContractAddress(txTo, provider);
			return {
				isContract,
				isKnownContract: false,
				contractType: isContract ? 'unknown' : null
			};
		} catch (error) {
			// If check fails, assume not a contract
		}
	}

	return {
		isContract: false,
		isKnownContract: false,
		contractType: null
	};
}

/**
 * Batch check multiple addresses for contract code
 */
export async function batchCheckContractAddresses(
	addresses: string[],
	provider: ethers.Provider
): Promise<Map<string, boolean>> {
	const results = new Map<string, boolean>();
	const uncachedAddresses: string[] = [];

	// Check cache first
	for (const address of addresses) {
		const normalized = address.toLowerCase();
		const cached = contractCodeCache.get(`${normalized}-latest`);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			results.set(normalized, cached.isContract);
		} else {
			uncachedAddresses.push(address);
		}
	}

	// Batch check uncached addresses
	if (uncachedAddresses.length > 0) {
		const checks = await Promise.allSettled(
			uncachedAddresses.map(addr => isContractAddress(addr, provider))
		);

		checks.forEach((result, index) => {
			const address = uncachedAddresses[index].toLowerCase();
			if (result.status === 'fulfilled') {
				results.set(address, result.value);
			} else {
				results.set(address, false);
			}
		});
	}

	return results;
}

/**
 * Clear contract code cache (useful for testing or forced refresh)
 */
export function clearContractCodeCache(): void {
	contractCodeCache.clear();
}

