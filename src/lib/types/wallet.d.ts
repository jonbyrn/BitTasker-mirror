import type { RSKNetwork } from "$lib/utils/wallet/escrowContract";
import { EscrowStatus } from "$lib/utils/enums/wallet.enum";

export type RSKUnit = 'rbtc' | 'wei';

// ERC-20 Token Configuration
export interface RSKToken {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoUrl?: string;
}

// Transaction types
export interface RSKTransaction {
    hash: string;
    from: string;
    to: string;
    value: string;
    gasUsed: string;
    gasPrice: string;
    blockNumber: number;
    timestamp: number;
    status: 'pending' | 'confirmed' | 'failed';
    type: 'send' | 'receive' | 'contract';
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
    token: RSKToken;
    balance: bigint;
    formattedBalance: string;
}

// Store state interface
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
    transactions: RSKTransaction[];
    pendingTransactions: RSKTransaction[];

    // Escrows
    escrows: EscrowData[];
    disputeProposals: DisputeProposal[];

    // Contract
    contractAddress: string | null;
    contractConnected: boolean;
    contractConfig: ContractConfig | null;
}

// Contract configuration interface
export interface ContractConfig {
	address: string;
	abi: any[];
	network: 'mainnet' | 'testnet';
}