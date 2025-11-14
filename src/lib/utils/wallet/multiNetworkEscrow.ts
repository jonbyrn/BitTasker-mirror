import { ethers } from 'ethers';
import { get } from 'svelte/store';
import { walletStore } from '$lib/stores/wallet.store';
import { FEE_TIERS, type FeeTier, RSK_NETWORKS, BSC_NETWORKS } from '$lib/utils/wallet/networkConfig';
import escrowABI from '$lib/utils/constants/escrowABI.json';
import type { GasEstimation } from '@bittasker/wallet-core';

// Network types
export type EscrowNetwork = 'RSK' | 'BSC';
export type NetworkEnvironment = 'mainnet' | 'testnet';

// Network configuration interface
export interface NetworkConfig {
	name: string;
	chainId: number;
	rpcUrl: string;
	explorerUrl: string;
	contractAddress: string;
	nativeToken: {
		name: string;
		symbol: string;
		decimals: number;
	};
	gasPrice?: bigint;
}

// Helper function to get escrow network config from centralized configs
function getEscrowNetworkConfig(network: EscrowNetwork, environment: NetworkEnvironment): NetworkConfig {
	const contractAddress = network === 'RSK' 
		? (environment === 'mainnet' 
			? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET || ''
			: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET || '')
		: import.meta.env.VITE_BSC_CONTRACT_ADDRESS || '';

	if (network === 'RSK') {
		const rskConfig = RSK_NETWORKS[environment];
		return {
			name: rskConfig.name,
			chainId: rskConfig.chainId,
			rpcUrl: rskConfig.rpcUrl,
			explorerUrl: rskConfig.explorerUrl,
			contractAddress,
			nativeToken: {
				name: rskConfig.currency.name,
				symbol: rskConfig.currency.symbol,
				decimals: rskConfig.currency.decimals
			}
		};
	} else {
		const bscConfig = BSC_NETWORKS[environment];
		return {
			name: bscConfig.name,
			chainId: bscConfig.chainId,
			rpcUrl: bscConfig.rpcUrl,
			explorerUrl: bscConfig.explorerUrl,
			contractAddress,
			nativeToken: {
				name: bscConfig.currency.name,
				symbol: bscConfig.currency.symbol,
				decimals: bscConfig.currency.decimals
			}
		};
	}
}

// Escrow operation result
export interface EscrowOperationResult {
	success: boolean;
	transactionHash?: string;
	error?: string;
	network?: EscrowNetwork;
	environment?: NetworkEnvironment;
}

// Multi-network escrow manager
export class MultiNetworkEscrowManager {
	private contracts: Map<string, ethers.Contract> = new Map();
	private providers: Map<string, ethers.JsonRpcProvider> = new Map();
	private wallets: Map<string, ethers.Wallet> = new Map();

	/**
	 * Get network configuration
	 */
	getNetworkConfig(network: EscrowNetwork, environment: NetworkEnvironment): NetworkConfig {
		return getEscrowNetworkConfig(network, environment);
	}

	/**
	 * Get or create provider for network
	 */
	async getProvider(network: EscrowNetwork, environment: NetworkEnvironment): Promise<ethers.JsonRpcProvider> {
		const key = `${network}-${environment}`;
		
		if (!this.providers.has(key)) {
			const config = this.getNetworkConfig(network, environment);
			const provider = new ethers.JsonRpcProvider(config.rpcUrl);
			this.providers.set(key, provider);
		}
		
		return this.providers.get(key)!;
	}

	/**
	 * Get or create wallet for network
	 */
	async getWallet(network: EscrowNetwork, environment: NetworkEnvironment): Promise<ethers.Wallet> {
		const key = `${network}-${environment}`;
		
		if (!this.wallets.has(key)) {
			const provider = await this.getProvider(network, environment);
			
		if (network === 'RSK') {
			// Use existing RSK wallet from store
			const walletState = get(walletStore);
			if (!walletState.rsk.wallet) {
				throw new Error('RSK wallet not initialized');
			}
			const wallet = new ethers.Wallet(walletState.rsk.wallet.privateKey, provider);
			this.wallets.set(key, wallet);
		} else if (network === 'BSC') {
			// Use existing BSC wallet from unified store
			const walletState = get(walletStore);
			if (!walletState.bsc.wallet) {
				throw new Error('BSC wallet not initialized');
			}
			const wallet = new ethers.Wallet(walletState.bsc.wallet.privateKey, provider);
			this.wallets.set(key, wallet);
		}
		}
		
		return this.wallets.get(key)!;
	}

	/**
	 * Get or create contract instance
	 */
	async getContract(network: EscrowNetwork, environment: NetworkEnvironment): Promise<ethers.Contract> {
		const key = `${network}-${environment}`;
		
		if (!this.contracts.has(key)) {
			const config = this.getNetworkConfig(network, environment);
			const wallet = await this.getWallet(network, environment);
			
			const contractAddress = ethers.getAddress(config.contractAddress);
			const contract = new ethers.Contract(contractAddress, escrowABI, wallet);
			
			this.contracts.set(key, contract);
		}
		
		return this.contracts.get(key)!;
	}

	/**
	 * Check if network is ready for escrow operations
	 */
	async ensureNetworkReady(network: EscrowNetwork, environment: NetworkEnvironment): Promise<{
		contract: ethers.Contract;
		wallet: ethers.Wallet;
		provider: ethers.JsonRpcProvider;
		config: NetworkConfig;
	}> {
		try {
			const contract = await this.getContract(network, environment);
			const wallet = await this.getWallet(network, environment);
			const provider = await this.getProvider(network, environment);
			const config = this.getNetworkConfig(network, environment);
			
			// Check if contract address is set
			if (!config.contractAddress || config.contractAddress === '') {
				const envVarName = network === 'RSK' 
					? `VITE_RSK_CONTRACT_ADDRESS_${environment.toUpperCase()}`
					: 'VITE_BSC_CONTRACT_ADDRESS';
				throw new Error(`Contract address not configured for ${network} ${environment}. Please set ${envVarName} environment variable.`);
			}

			// Check wallet balance
			const balance = await provider.getBalance(wallet.address);
			
			if (balance === 0n) {
				throw new Error(`Insufficient ${config.nativeToken.symbol} balance for gas fees`);
			}

			// Verify contract is deployed by checking if we can call a basic function
			try {
				// Try to get the contract owner as a way to verify it's deployed
				await contract.owner();
			} catch {
				throw new Error(`Contract not deployed or not accessible at ${config.contractAddress}`);
			}

			return { contract, wallet, provider, config };
		} catch (error) {
			throw new Error(`Network ${network} ${environment} not ready: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Create escrow on specified network
	 */
	async createEscrow(
		network: EscrowNetwork,
		environment: NetworkEnvironment,
		freelancerAddress: string,
		baseAmount: string,
		estimatedStartTime: number,
		estimatedCompletionTime: number,
		clientFeeTier: FeeTier,
		freelancerFeeTier: FeeTier
	): Promise<EscrowOperationResult> {
		try {
			const { contract } = await this.ensureNetworkReady(network, environment);

			const baseAmountWei = ethers.parseEther(baseAmount);
			const totalPayment = this.calculateTotalPayment(baseAmountWei, clientFeeTier);

			// Estimate gas first
			const gasEstimate = await contract.createEscrow.estimateGas(
				freelancerAddress,
				estimatedStartTime,
				estimatedCompletionTime,
				clientFeeTier,
				freelancerFeeTier,
				{ value: totalPayment }
			);

			// Execute transaction
			console.log('🚀 [MultiNetworkEscrow] Sending transaction...');
			const tx = await contract.createEscrow(
				freelancerAddress,
				estimatedStartTime,
				estimatedCompletionTime,
				clientFeeTier,
				freelancerFeeTier,
				{
					value: totalPayment,
					gasLimit: gasEstimate + (gasEstimate / 10n) // Add 10% buffer
				}
			);

			console.log('✅ [MultiNetworkEscrow] Transaction sent:', tx.hash);
			console.log('⏳ [MultiNetworkEscrow] Waiting for confirmation...');
			
			// Wait for transaction confirmation with timeout
			try {
				const receipt = await Promise.race([
					tx.wait(),
					new Promise((_, reject) => 
						setTimeout(() => reject(new Error('Transaction confirmation timeout')), 120000) // 2 minutes timeout
					)
				]) as { blockNumber?: number };
				console.log('✅ [MultiNetworkEscrow] Transaction confirmed:', receipt?.blockNumber);
			} catch {
				console.warn('⚠️ [MultiNetworkEscrow] Transaction confirmation timeout, but transaction was sent:', tx.hash);
				// Continue anyway - the transaction might still be processing
			}

			return {
				success: true,
				transactionHash: tx.hash,
				network,
				environment
			};
		} catch (error) {
			return {
				success: false,
				error: this.extractUserFriendlyError(error),
				network,
				environment
			};
		}
	}

	/**
	 * Complete task on specified network
	 */
	async completeTask(
		network: EscrowNetwork,
		environment: NetworkEnvironment,
		escrowId: string
	): Promise<EscrowOperationResult> {
		try {
			const { contract } = await this.ensureNetworkReady(network, environment);

			const tx = await contract.completeTask(escrowId);

			return {
				success: true,
				transactionHash: tx.hash,
				network,
				environment
			};
		} catch (error) {
			return {
				success: false,
				error: this.extractUserFriendlyError(error),
				network,
				environment
			};
		}
	}

	/**
	 * Accept task on specified network
	 */
	async acceptTask(
		network: EscrowNetwork,
		environment: NetworkEnvironment,
		escrowId: string
	): Promise<EscrowOperationResult> {
		try {
			const { contract } = await this.ensureNetworkReady(network, environment);

			const tx = await contract.acceptTask(escrowId);

			return {
				success: true,
				transactionHash: tx.hash,
				network,
				environment
			};
		} catch (error) {
			return {
				success: false,
				error: this.extractUserFriendlyError(error),
				network,
				environment
			};
		}
	}

	/**
	 * Cancel escrow on specified network
	 */
	async cancelEscrow(
		network: EscrowNetwork,
		environment: NetworkEnvironment,
		escrowId: string
	): Promise<EscrowOperationResult> {
		try {
			const { contract } = await this.ensureNetworkReady(network, environment);

			const tx = await contract.cancelEscrow(escrowId);

			return {
				success: true,
				transactionHash: tx.hash,
				network,
				environment
			};
		} catch (error) {
			return {
				success: false,
				error: this.extractUserFriendlyError(error),
				network,
				environment
			};
		}
	}

	/**
	 * Dispute task on specified network
	 */
	async disputeTask(
		network: EscrowNetwork,
		environment: NetworkEnvironment,
		escrowId: string,
		reason: string
	): Promise<EscrowOperationResult> {
		try {
			const { contract } = await this.ensureNetworkReady(network, environment);

			const tx = await contract.disputeTask(escrowId, reason);

			return {
				success: true,
				transactionHash: tx.hash,
				network,
				environment
			};
		} catch (error) {
			return {
				success: false,
				error: this.extractUserFriendlyError(error),
				network,
				environment
			};
		}
	}

	/**
	 * Estimate gas for escrow creation
	 */
	async estimateCreateEscrowGas(
		network: EscrowNetwork,
		environment: NetworkEnvironment,
		freelancerAddress: string,
		baseAmount: string,
		estimatedStartTime: number,
		estimatedCompletionTime: number,
		clientFeeTier: FeeTier,
		freelancerFeeTier: FeeTier
	): Promise<GasEstimation> {
		try {
			const { contract, provider } = await this.ensureNetworkReady(network, environment);

			const baseAmountWei = ethers.parseEther(baseAmount);
			const totalPayment = this.calculateTotalPayment(baseAmountWei, clientFeeTier);

			const gasEstimate = await contract.createEscrow.estimateGas(
				freelancerAddress,
				estimatedStartTime,
				estimatedCompletionTime,
				clientFeeTier,
				freelancerFeeTier,
				{ value: totalPayment }
			);

			const gasPrice = await provider.getFeeData();
			const gasCost = gasEstimate * (gasPrice.gasPrice || 0n);

			return {
				gasLimit: gasEstimate.toString(),
				gasPrice: (gasPrice.gasPrice || 0n).toString(),
				totalCost: (totalPayment + gasCost).toString(),
				totalCostFormatted: ethers.formatEther(totalPayment + gasCost)
			};
		} catch (error) {
			throw new Error(`Gas estimation failed: ${this.extractUserFriendlyError(error)}`);
		}
	}

	/**
	 * Get escrow details from contract
	 */
	async getEscrowDetails(
		network: EscrowNetwork,
		environment: NetworkEnvironment,
		escrowId: string
	): Promise<unknown> {
		try {
			const { contract } = await this.ensureNetworkReady(network, environment);
			return await contract.getEscrowDetails(escrowId);
		} catch (error) {
			throw new Error(`Failed to get escrow details: ${this.extractUserFriendlyError(error)}`);
		}
	}

	/**
	 * Calculate total payment including fees
	 */
	private calculateTotalPayment(baseAmount: bigint, clientFeeTier: FeeTier): bigint {
		const feePercentage = FEE_TIERS[clientFeeTier].percentage;
		const feeAmount = (baseAmount * BigInt(feePercentage)) / 10000n;
		return baseAmount + feeAmount;
	}

	/**
	 * Extract user-friendly error messages
	 */
	private extractUserFriendlyError(error: unknown): string {
		if (!(error instanceof Error)) {
			return 'An unknown error occurred';
		}

		const message = error.message.toLowerCase();

		// Network-specific errors
		if (message.includes('network')) {
			return 'Network connection error. Please check your internet connection.';
		}
		if (message.includes('gas')) {
			return 'Insufficient gas for transaction. Please ensure you have enough native tokens for gas fees.';
		}
		if (message.includes('balance')) {
			return 'Insufficient balance for transaction.';
		}
		if (message.includes('contract')) {
			return 'Smart contract error. Please try again or contact support.';
		}
		if (message.includes('revert')) {
			return 'Transaction failed. Please check the transaction details and try again.';
		}
		if (message.includes('timeout')) {
			return 'Transaction timeout. Please try again.';
		}
		if (message.includes('nonce')) {
			return 'Transaction nonce error. Please wait a moment and try again.';
		}

		// Generic fallback
		return error.message || 'An unexpected error occurred';
	}

	/**
	 * Clear cached instances (useful for testing or network switching)
	 */
	clearCache(): void {
		this.contracts.clear();
		this.providers.clear();
		this.wallets.clear();
	}
}

// Export singleton instance
export const multiNetworkEscrow = new MultiNetworkEscrowManager();

// Export utility functions
export function getAvailableNetworks(): Array<{ network: EscrowNetwork; environment: NetworkEnvironment; config: NetworkConfig }> {
	const networks: Array<{ network: EscrowNetwork; environment: NetworkEnvironment; config: NetworkConfig }> = [];
	
	// Add RSK networks
	const rskEnvironments: NetworkEnvironment[] = ['mainnet', 'testnet'];
	for (const environment of rskEnvironments) {
		const config = getEscrowNetworkConfig('RSK', environment);
		if (config.contractAddress) {
			networks.push({
				network: 'RSK',
				environment,
				config
			});
		}
	}
	
	// Add BSC networks
	const bscEnvironments: NetworkEnvironment[] = ['mainnet', 'testnet'];
	for (const environment of bscEnvironments) {
		const config = getEscrowNetworkConfig('BSC', environment);
		if (config.contractAddress) {
			networks.push({
				network: 'BSC',
				environment,
				config
			});
		}
	}
	
	return networks;
}

export function formatNetworkName(network: EscrowNetwork, environment: NetworkEnvironment): string {
	const config = getEscrowNetworkConfig(network, environment);
	return config ? `${config.name}` : `${network} ${environment}`;
}

export function getExplorerUrl(network: EscrowNetwork, environment: NetworkEnvironment, txHash: string): string {
	const config = getEscrowNetworkConfig(network, environment);
	return config ? `${config.explorerUrl}/tx/${txHash}` : '';
}
