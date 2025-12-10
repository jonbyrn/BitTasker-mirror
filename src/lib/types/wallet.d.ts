/**
 * @deprecated This file is no longer used. Use the types from @bittasker/wallet-core instead.
 */

import type { ethers } from 'ethers';
import type { RSKNetwork } from "$lib/utils/wallet/networkConfig";
import { EscrowStatus } from "$lib/utils/enums/wallet.enum";

export type RSKUnit = 'rbtc' | 'wei';
export type BSCUnit = 'usdt' | 'wei';
export type NetworkType = 'mainnet' | 'testnet' | 'regtest';

// ERC-20 Token Configuration for all networks (RSK, BSC)
export interface ERC20Token {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoUrl?: string;
}

// Paymaster configuration interface
export interface PaymasterConfig {
    address: string;
    usdtTokenAddress: string;
    minDeposit: bigint; // Minimum BNB deposit required
    maxGasPrice: bigint; // Maximum gas price in wei
    usdtPriceOracle: string; // Price oracle address for USDT/BNB
}

// Transaction types
export interface Transaction {
    hash: string;
    from: string;
    to: string;
    value: string;
    gasUsed: string;
    gasPrice: string;
    blockNumber: number;
    timestamp: number;
    status: 'pending' | 'confirmed' | 'failed';
    type: 'send' | 'receive' | 'contract' | 'swap' | 'contract-function' | 'contract-send' | 'contract-receive';
    network: 'rsk' | 'bsc'; // Explicitly identify the network
    tokenSymbol?: string; // Optional for token transactions (BSC USDT)
    swapType?: 'chain' | 'reverse'; // Type of swap (chain: L-BTC→RBTC, reverse: Lightning→RBTC)
    description?: string; // Transaction description (for UI display)
    formattedAmount?: string; // Pre-formatted amount with symbol (for UI display)
    fee?: number; // Transaction fee in native currency (for UI display)
    asset?: string; // Asset symbol (for UI display)
    id?: string; // Unique identifier (for UI display)
    address?: string; // Associated address (for UI display)
    txHash?: string; // Transaction hash alias (for UI compatibility)
    balanceAfter?: number; // Balance after transaction in sats (from blockchain API)
    // Contract interaction fields
    contractAddress?: string; // Contract that was interacted with
    contractFunction?: string; // Function name (e.g., "createEscrow", "transfer")
    contractMetadata?: {
        escrowId?: string;
        taskId?: string;
        taskTitle?: string;
        functionName?: string;
        functionSelector?: string;
        contractType?: 'escrow' | 'swap' | 'unknown';
        network?: 'rsk' | 'bsc';
        environment?: 'mainnet' | 'testnet';
    };
}

// Enhanced Escrow types
export interface EscrowData {
    id: string;
    client: string;
    freelancer: string;
    baseAmount: string;
    clientFee: string;
    freelancerFee: string;
    totalAmount: string;
    status: EscrowStatus;
    estimatedStartTime: number;
    estimatedCompletionTime: number;
    completionTime: number;
    timelockExpiry: number;
    clientFeeTier: FeeTier;
    freelancerFeeTier: FeeTier;
    createdAt: number;
    lastUpdated: number;
}

// Dispute proposal interface
export interface DisputeProposal {
    escrowId: string;
    proposer: string;
    clientAmount?: string;
    freelancerAmount: string;
    timestamp: number;
    accepted: boolean;
}

// Contract transaction result
export interface ContractTransactionResult {
    hash: string;
    escrowId?: string;
    gasUsed?: string;
    status: 'pending' | 'confirmed' | 'failed';
}

// Asset metadata
export interface AssetMetadata {
	assetId: string;
	name: string;
	ticker: string;
	precision: number;
	icon: string;
	fiatId?: string; // For assets that can pay fees
}

/**
 * Boltz and RIF Relay Configuration
 */
export interface BoltzNetworkConfig {
	// Boltz API
	boltzApiUrl: string;
	boltzWsUrl: string;
	
	// RSK Network
	rskRpcUrl: string;
	rskChainId: number;
	rskExplorerUrl: string;
	rskExplorerApiUrl: string;
	
	// RIF Relay
	rifRelayServerUrl: string;
	rifRelayEnabled: boolean;
	contracts: {
		deployHeight: number;
		smartWalletFactory: string;
		deployVerifier: string;
	};
}