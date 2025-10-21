/**
 * Smart Wallet Service
 * Manages Smart Wallet deployment and address lookups for RIF Relay gasless transactions
 * 
 * A Smart Wallet is a smart contract that:
 * - Is owned by a user's EOA (Externally Owned Account)
 * - Enables gasless transactions via RIF Relay
 * - Is deployed once and reused for all future gasless operations
 * 
 * NOTE: Currently uses in-memory cache for Smart Wallet addresses.
 * Persistence to Nostr will be added later.
 */

import { ethers, type Wallet } from 'ethers';
import { rifRelayHttpClient } from './rifRelayHttpClient';

// In-memory cache for Smart Wallet addresses
// Format: { [eoaAddress]: smartWalletAddress }
const smartWalletCache: Record<string, string> = {};

export class SmartWalletServiceError extends Error {
	constructor(
		message: string,
		public code: string,
		public originalError?: unknown
	) {
		super(message);
		this.name = 'SmartWalletServiceError';
	}
}

/**
 * Smart Wallet Service
 * Handles Smart Wallet deployment and management
 */
export class SmartWalletService {
	/**
	 * Get Smart Wallet address for a user (from cache)
	 * 
	 * @param eoaAddress - User's EOA address
	 * @returns Smart Wallet address if deployed, null otherwise
	 */
	async getSmartWalletAddress(eoaAddress: string): Promise<string | null> {
		try {
			console.log('🔍 Looking for Smart Wallet for EOA:', eoaAddress);

			// Check in-memory cache
			if (smartWalletCache[eoaAddress]) {
				console.log('✅ Found Smart Wallet in cache:', smartWalletCache[eoaAddress]);
				return smartWalletCache[eoaAddress];
			}

			console.log('⚠️ No Smart Wallet found in cache');
			return null;
		} catch (error) {
			console.error('❌ Failed to get Smart Wallet address:', error);
			return null;
		}
	}

	/**
	 * Deploy a new Smart Wallet for a user
	 * 
	 * @param eoaAddress - User's EOA address (owner)
	 * @param wallet - User's wallet for signing
	 * @param sponsorGas - If true, we pay gas; if false, user pays
	 * @returns Smart Wallet contract address
	 */
	async deploySmartWallet(
		eoaAddress: string,
		wallet: Wallet,
		sponsorGas: boolean = false
	): Promise<string> {
		try {
			console.log('🚀 Deploying Smart Wallet for:', eoaAddress);
			console.log('💰 Sponsor gas:', sponsorGas);

			if (sponsorGas) {
				// Option A: We sponsor the deployment (our funded wallet pays gas)
				// TODO: Implement sponsored deployment using a service wallet
				throw new SmartWalletServiceError(
					'Sponsored deployment not yet implemented',
					'SPONSOR_NOT_IMPLEMENTED'
				);
			} else {
				// Option B: User pays gas for deployment (via RIF Relay)
				// This still uses RIF Relay but user must have small RBTC for first deployment
				const smartWalletAddress = await rifRelayHttpClient.deploySmartWallet(
					eoaAddress,
					wallet,
					0  // Index 0 (first Smart Wallet)
				);

				console.log('✅ Smart Wallet deployed:', smartWalletAddress);
				
				// Cache the address
				smartWalletCache[eoaAddress] = smartWalletAddress;
				
				return smartWalletAddress;
			}
		} catch (error) {
			console.error('❌ Failed to deploy Smart Wallet:', error);

			if (error instanceof SmartWalletServiceError) {
				throw error;
			}

			throw new SmartWalletServiceError(
				'Smart Wallet deployment failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
				'DEPLOYMENT_FAILED',
				error
			);
		}
	}

	/**
	 * Ensure Smart Wallet exists for user (deploy if needed)
	 * 
	 * This is the main method to call before gasless transactions.
	 * It will:
	 * 1. Check if Smart Wallet already exists (in cache)
	 * 2. If not, deploy new Smart Wallet
	 * 3. Cache the address for future use
	 * 
	 * @param eoaAddress - User's EOA address
	 * @param wallet - User's wallet for signing
	 * @returns Smart Wallet address
	 */
	async ensureSmartWallet(
		eoaAddress: string,
		wallet: Wallet
	): Promise<string> {
		try {
			console.log('🔧 Ensuring Smart Wallet exists for:', eoaAddress);

			// 1. Check if already deployed (in cache)
			const existing = await this.getSmartWalletAddress(eoaAddress);
			
			if (existing) {
				console.log('✅ Smart Wallet already exists:', existing);
				return existing;
			}

			// 2. Deploy new Smart Wallet
			console.log('⚙️ No Smart Wallet found, deploying new one...');
			
			const smartWalletAddress = await this.deploySmartWallet(
				eoaAddress,
				wallet,
				false  // User pays gas for first deployment
			);

			console.log('✅ Smart Wallet setup complete:', smartWalletAddress);
			return smartWalletAddress;
		} catch (error) {
			console.error('❌ Failed to ensure Smart Wallet:', error);

			if (error instanceof SmartWalletServiceError) {
				throw error;
			}

			throw new SmartWalletServiceError(
				'Smart Wallet setup failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
				'SETUP_FAILED',
				error
			);
		}
	}

	/**
	 * Check if user has Smart Wallet deployed
	 * 
	 * @param eoaAddress - User's EOA address
	 * @returns True if Smart Wallet exists
	 */
	async hasSmartWallet(eoaAddress: string): Promise<boolean> {
		const smartWallet = await this.getSmartWalletAddress(eoaAddress);
		return smartWallet !== null;
	}

	/**
	 * Manually set Smart Wallet address (for testing or recovery)
	 * 
	 * @param eoaAddress - User's EOA address
	 * @param smartWalletAddress - Smart Wallet contract address
	 */
	setSmartWalletAddress(eoaAddress: string, smartWalletAddress: string): void {
		console.log('📝 Manually setting Smart Wallet address:', { eoaAddress, smartWalletAddress });
		smartWalletCache[eoaAddress] = smartWalletAddress;
	}

	/**
	 * Compute deterministic Smart Wallet address
	 * 
	 * Smart Wallet addresses are deterministic based on:
	 * - Owner EOA address
	 * - Smart Wallet index (usually 0)
	 * - Smart Wallet factory address
	 * 
	 * This allows us to know the address before deployment.
	 * 
	 * NOTE: This is a placeholder. The actual computation depends on
	 * the Smart Wallet factory contract implementation.
	 * 
	 * @param eoaAddress - User's EOA address
	 * @param index - Smart Wallet index
	 * @param factoryAddress - Smart Wallet factory contract address
	 * @returns Computed Smart Wallet address
	 */
	computeSmartWalletAddress(
		eoaAddress: string,
		index: number,
		factoryAddress: string
	): string {
		// TODO: Implement actual deterministic address computation
		// This requires knowing the exact CREATE2 salt and bytecode used by the factory
		
		// For now, return placeholder
		throw new SmartWalletServiceError(
			'Deterministic address computation not yet implemented',
			'NOT_IMPLEMENTED'
		);
	}
}

// Export singleton instance
export const smartWalletService = new SmartWalletService();

