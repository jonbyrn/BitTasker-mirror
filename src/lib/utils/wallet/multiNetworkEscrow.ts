import { ethers } from 'ethers';
import { get } from 'svelte/store';
import { walletStore } from '$lib/stores/wallet.store';
import { bscUsdtWalletStore } from '$lib/stores/bscUsdtWallet.store';
import { FEE_TIERS, type FeeTier } from './escrowContract';
import escrowABI from '$lib/utils/constants/escrowABI.json';
import type { ContractTransactionResult, GasEstimation } from '$lib/types/wallet';

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

// Escrow network configurations
export const ESCROW_NETWORKS: Record<EscrowNetwork, Record<NetworkEnvironment, NetworkConfig>> = {
	RSK: {
		mainnet: {
			name: 'RSK Mainnet',
			chainId: 30,
			rpcUrl: 'https://public-node.rsk.co',
			explorerUrl: 'https://explorer.rsk.co',
			contractAddress: import.meta.env.VITE_RSK_CONTRACT_ADDRESS || '',
			nativeToken: {
				name: 'Smart Bitcoin',
				symbol: 'RBTC',
				decimals: 18
			}
		},
		testnet: {
			name: 'RSK Testnet',
			chainId: 31,
			rpcUrl: 'https://public-node.testnet.rsk.co',
			explorerUrl: 'https://explorer.testnet.rsk.co',
			contractAddress: import.meta.env.VITE_RSK_CONTRACT_ADDRESS || '',
			nativeToken: {
				name: 'Testnet Smart Bitcoin',
				symbol: 'tRBTC',
				decimals: 18
			}
		}
	},
	BSC: {
		mainnet: {
			name: 'BSC Mainnet',
			chainId: 56,
			rpcUrl: 'https://bsc-dataseed.binance.org',
			explorerUrl: 'https://bscscan.com',
			contractAddress: import.meta.env.VITE_BSC_CONTRACT_ADDRESS || '',
			nativeToken: {
				name: 'Binance Coin',
				symbol: 'BNB',
				decimals: 18
			}
		},
		testnet: {
			name: 'BSC Testnet',
			chainId: 97,
			rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
			explorerUrl: 'https://testnet.bscscan.com',
			contractAddress: import.meta.env.VITE_BSC_CONTRACT_ADDRESS || '',
			nativeToken: {
				name: 'Testnet Binance Coin',
				symbol: 'tBNB',
				decimals: 18
			}
		}
	}
};

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
		const config = ESCROW_NETWORKS[network]?.[environment];
		if (!config) {
			throw new Error(`Network configuration not found for ${network} ${environment}`);
		}
		if (!config.contractAddress) {
			throw new Error(`Contract address not configured for ${network} ${environment}`);
		}
		return config;
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
				// Use existing BSC wallet from store
				const bscState = get(bscUsdtWalletStore);
				if (!bscState.wallet) {
					throw new Error('BSC wallet not initialized');
				}
				const wallet = new ethers.Wallet(bscState.wallet.privateKey, provider);
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

			// Check wallet balance
			const balance = await provider.getBalance(wallet.address);
			if (balance === 0n) {
				throw new Error(`Insufficient ${config.nativeToken.symbol} balance for gas fees`);
			}

			// Verify contract is deployed
			try {
				await contract.getContractVersion();
			} catch (error) {
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
			const { contract, config } = await this.ensureNetworkReady(network, environment);

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
				gasLimit: gasEstimate,
				gasPrice: gasPrice.gasPrice || 0n,
				gasCost,
				totalCost: totalPayment + gasCost
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
	): Promise<any> {
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
	
	for (const [network, environments] of Object.entries(ESCROW_NETWORKS)) {
		for (const [environment, config] of Object.entries(environments)) {
			if (config.contractAddress) {
				networks.push({
					network: network as EscrowNetwork,
					environment: environment as NetworkEnvironment,
					config
				});
			}
		}
	}
	
	return networks;
}

export function formatNetworkName(network: EscrowNetwork, environment: NetworkEnvironment): string {
	const config = ESCROW_NETWORKS[network]?.[environment];
	return config ? `${config.name}` : `${network} ${environment}`;
}

export function getExplorerUrl(network: EscrowNetwork, environment: NetworkEnvironment, txHash: string): string {
	const config = ESCROW_NETWORKS[network]?.[environment];
	return config ? `${config.explorerUrl}/tx/${txHash}` : '';
}
