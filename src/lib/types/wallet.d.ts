import type { ethers } from 'ethers';
import type { Rate } from '@breeztech/breez-sdk-liquid/web';
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
    type: 'send' | 'receive' | 'contract' | 'swap';
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

// Gas estimation result
export interface GasEstimation {
    gasLimit: string;
    gasPrice: string;
    totalCost: string;
    totalCostFormatted: string;
    usdtCost?: string; // Cost in USDT if paying fees in USDT
}

// Contract transaction result
export interface ContractTransactionResult {
    hash: string;
    escrowId?: string;
    gasUsed?: string;
    status: 'pending' | 'confirmed' | 'failed';
}

// Token balance interface
export interface TokenBalance {
    token: ERC20Token;
    balance: bigint;
    formattedBalance: string;
    usdValue?: number;
}

// Contract configuration interface
export interface ContractConfig {
    address: string;
    abi: any[];
    network: NetworkType;
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

// Wallet asset interface
export interface WalletAsset extends AssetMetadata {
    balance: number;
    usdValue: number;
    formattedBalance: string;
    network: 'Liquid' | 'Bitcoin' | 'RSK' | 'BSC';
}

// RSK Wallet State interface
export interface RSKWalletState {
    // Connection
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
    network: RSKNetwork;

    // Wallet
    address: string | null;
    balance: string;
    formattedBalance: string;
    blockNumber: number | null;
    unitPreference: RSKUnit;

    // Tokens
    tokenBalances: TokenBalance[];

    // Transactions
    transactions: Transaction[];
    pendingTransactions: Transaction[];

    // Escrows
    escrows: EscrowData[];
    disputeProposals: DisputeProposal[];

    // Contract
    contractAddress: string | null;
    contractConnected: boolean;
    contractConfig: ContractConfig | null;
}

// BSC Wallet State interface
export interface BSCWalletState {
    // Connection
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
    network: NetworkType;

    // Wallet
    address: string | null;
    bnbBalance: string;
    formattedBnbBalance: string;
    blockNumber: number | null;

    // Tokens
    tokenBalances: TokenBalance[];
    usdtBalance: string;
    formattedUsdtBalance: string;

    // Transactions
    transactions: Transaction[];
    pendingTransactions: Transaction[];

    // EIP-7702 Support
    paymasterConnected: boolean;
    paymasterAddress: string | null;
    canPayFeesInUsdt: boolean;
}

// Combined wallet state
export interface WalletState {
    // Connection status
    isInitializing: boolean;
    isConnected: boolean;
    isConnecting: boolean;
    hasAnyConnection: boolean;
    error: string | null;

    // Network states
    rsk: {
        connected: boolean;
        connecting: boolean;
        error: string | null;
        address: string | null;
        balance: string;
        formattedBalance: string;
        blockNumber: number | null;
        provider: ethers.JsonRpcProvider | null;
        wallet: ethers.Wallet | null;
        contractAddress?: string;
        contractConnected?: boolean;
        escrows?: EscrowData[];
    };
    bsc: {
        connected: boolean;
        connecting: boolean;
        error: string | null;
        address: string | null;
        bnbBalance: string;
        formattedBnbBalance: string;
        usdtBalance: string;
        formattedUsdtBalance: string;
        blockNumber: number | null;
        provider: ethers.JsonRpcProvider | null;
        wallet: ethers.Wallet | null;
        usdtContract: ethers.Contract | null;
        paymasterContract: any | null; // BSCPaymasterContract type
        paymasterConnected: boolean;
        paymasterAddress: string | null;
        canPayFeesInUsdt: boolean;
    };

    // Combined data
    assets: WalletAsset[];
    transactions: Transaction[];
    fiatRates: Rate[];
    totalBalances: {
        usd: number;
        sats: number;
        rbtc: number;
        usdt: number;
        bnb: number;
    };

    // Exchange rates
    rbtcToBtcRate: number;
    rbtcRateError: boolean;

    // UI state
    activeNetwork: 'liquid' | 'rsk' | 'bsc';
    activeTab: 'balance' | 'send' | 'receive' | 'transactions' | 'buy-sell' | 'swap';
    selectedAsset: string;
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