import { ethers } from 'ethers';
import type { NostrContract, NostrContractV1, NostrContractV2 } from '$lib/types/contract';
import { isNostrContractV2, isNostrContractV1 } from '$lib/types/contract';

/**
 * Extract contract address from transaction hash
 * This is a fallback for v1 contracts that don't have stored addresses
 */
async function extractContractAddressFromTx(
	transactionHash: string,
	network: 'RSK' | 'BSC',
	environment: 'mainnet' | 'testnet'
): Promise<string | null> {
	try {
		// Import network config to get RPC URL
		const { MultiNetworkEscrowManager } = await import('./multiNetworkEscrow');
		const escrowManager = new MultiNetworkEscrowManager();
		const networkConfig = escrowManager.getNetworkConfig(network, environment);
		const provider = await escrowManager.getProvider(network, environment);
		
		// Get transaction receipt
		const receipt = await provider.getTransactionReceipt(transactionHash);
		if (!receipt) {
			return null;
		}
		
		// Try to extract contract address from logs
		// This is a simplified approach - in production, you'd parse the EscrowCreated event
		// For now, we'll return null and fall back to env var
		return null;
	} catch (error) {
		console.warn('Failed to extract contract address from transaction:', error);
		return null;
	}
}

/**
 * Get current contract address from environment variables
 */
function getCurrentContractAddress(
	network: 'RSK' | 'BSC',
	environment: 'mainnet' | 'testnet'
): string {
	if (network === 'RSK') {
		const address = environment === 'mainnet'
			? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
			: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;
		
		if (!address) {
			const envVarName = environment === 'mainnet'
				? 'VITE_RSK_CONTRACT_ADDRESS_MAINNET'
				: 'VITE_RSK_CONTRACT_ADDRESS_TESTNET';
			throw new Error(`Contract address not configured for ${network} ${environment}. Please set ${envVarName} environment variable.`);
		}
		
		return ethers.getAddress(address);
	} else {
		const address = import.meta.env.VITE_BSC_CONTRACT_ADDRESS;
		if (!address) {
			throw new Error(`Contract address not configured for ${network} ${environment}. Please set VITE_BSC_CONTRACT_ADDRESS environment variable.`);
		}
		return ethers.getAddress(address);
	}
}

/**
 * Resolve contract address for a given contract
 * Version 2: Uses stored address (required)
 * Version 1: Falls back to transaction or env vars
 */
export async function resolveContractAddress(
	contract: NostrContract,
	network?: 'RSK' | 'BSC',
	environment?: 'mainnet' | 'testnet'
): Promise<string> {
	// Version 2: Contract address is required
	if (isNostrContractV2(contract)) {
		return ethers.getAddress(contract.contractAddress);
	}
	
	// Version 1: Fallback logic for legacy contracts
	if (isNostrContractV1(contract)) {
		// 1. Try to extract from transaction
		if (contract.transactionHash) {
			const address = await extractContractAddressFromTx(
				contract.transactionHash,
				network || 'RSK',
				environment || 'testnet'
			);
			if (address) return address;
		}
		
		// 2. Final fallback: Use current env var
		return getCurrentContractAddress(
			network || 'RSK',
			environment || 'testnet'
		);
	}
	
	// Should never reach here, but TypeScript needs this
	throw new Error('Invalid contract format');
}

/**
 * Resolve network and environment for a contract
 */
export function resolveContractNetwork(
	contract: NostrContract
): { network: 'RSK' | 'BSC'; environment: 'mainnet' | 'testnet' } {
	if (isNostrContractV2(contract)) {
		return {
			network: contract.network,
			environment: contract.environment
		};
	}
	
	// Version 1: Use defaults or current config
	return {
		network: 'RSK',
		environment: 'testnet'
	};
}

/**
 * Get total payment in USD
 */
export function getTotalPaymentUsd(contract: NostrContract): number | null {
	if (isNostrContractV2(contract)) {
		return contract.totalPaymentUsd;
	}
	
	// Version 1: Not available
	return null;
}

/**
 * Get BTC price at contract creation
 */
export function getBtcPriceAtCreation(contract: NostrContract): number | null {
	if (isNostrContractV2(contract)) {
		return contract.btcPriceAtCreation;
	}
	
	// Version 1: Not available
	return null;
}

