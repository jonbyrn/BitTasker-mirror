/**
 * Wallet Type Definitions
 *
 * This file contains wallet-related type definitions that extend or complement
 * the types from @bittasker/wallet-core package.
 */
import type { SwapPairs, Transaction, FeeTier } from '@bittasker/wallet-core';
import { ContractStatus } from '$lib/utils/contract/types';
import type { ComponentType } from 'svelte';

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

// Enhanced Escrow types
export interface EscrowData {
	id: string;
	client: string;
	freelancer: string;
	baseAmount: string;
	clientFee: string;
	freelancerFee: string;
	totalAmount: string;
	status: ContractStatus;
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
	status: 'pending' | 'confirmed' | 'failed' | 'rejected';
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
 * Token balance information from Blockscout API
 * Used for displaying all tokens (native and ERC-20) in debug wallet
 */
export interface TokenBalance {
	address: string; // Token contract address or 'native' for RBTC
	name: string;
	symbol: string;
	decimals: number;
	balance: string; // Raw balance (BigInt string)
	formattedBalance: string; // Human-readable balance
	usdValue?: number; // Optional USD value if price available
	icon?: string; // Optional token icon
	isNative?: boolean; // true for RBTC
}

/**
 * Token metadata from Blockscout API
 * Cached to avoid repeated API calls
 */
export interface TokenMetadata {
	address: string;
	name: string;
	symbol: string;
	decimals: number;
	totalSupply?: string;
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

// Swap pairs cache structure
export interface SwapPairsCache {
	data: SwapPairs;
	timestamp: number;
	ttl: number;
}

/**
 * Internal Transaction from Blockscout API
 * Represents value transfers that occur inside smart contract execution
 *
 * Example: When acceptTask() is called on escrow contract, it triggers an internal
 * transfer from the contract to the freelancer. This doesn't show up in regular
 * /transactions endpoint but appears in /internal-transactions endpoint.
 */
export interface InternalTransaction {
	// Transaction identification
	transaction_hash: string;
	internal_transaction_index: number;
	block_number: number;
	timestamp: string;

	// Parties involved
	from: {
		hash: string;
		is_contract: boolean;
		ens_domain_name: string | null;
		implementations: Record<string, unknown>[];
		is_scam: boolean;
		is_verified: boolean;
		metadata: Record<string, unknown> | null;
		name: string | null;
		private_tags: string[];
		proxy_type: string | null;
		public_tags: string[];
		reputation: string;
		watchlist_names: string[];
	};
	to: {
		hash: string;
		is_contract: boolean;
		ens_domain_name: string | null;
		implementations: Record<string, unknown>[];
		is_scam: boolean;
		is_verified: boolean;
		metadata: Record<string, unknown> | null;
		name: string | null;
		private_tags: string[];
		proxy_type: string | null;
		public_tags: string[];
		reputation: string;
		watchlist_names: string[];
	};

	// Transaction details
	value: string; // Wei value transferred
	success: boolean;
	type: 'call' | 'create' | 'reward' | 'selfdestruct'; // Internal transaction type
	gas_limit: string;

	// Optional fields that may be present
	error?: string | null;
	created_contract?: {
		hash: string;
		is_contract: boolean;
		ens_domain_name: string | null;
		implementations: Record<string, unknown>[];
		is_scam: boolean;
		is_verified: boolean;
		metadata: Record<string, unknown> | null;
		name: string | null;
		private_tags: string[];
		proxy_type: string | null;
		public_tags: string[];
		reputation: string;
		watchlist_names: string[];
	} | null;
}

/**
 * Extended Transaction type that unifies regular and internal transactions
 * This is what we use internally in the app after fetching from APIs
 *
 * Note: Transaction comes from @bittasker/wallet-core and has all blockchain fields
 */
export type ExtendedTransaction = Transaction & {
	// Flags to identify internal transactions
	_isInternal?: boolean;
	_internalIndex?: number;
};

/**
 * Processed Transaction - Ready for UI display
 * All display properties are pre-computed for optimal rendering
 */
export interface ProcessedTransaction {
	// Core fields from API (pass-through)
	hash: string;
	from: string;
	to: string;
	value: string; // sats
	timestamp: string; // API returns ISO 8601
	/** When set, list sort uses this instead of block/swap created time (keeps recent activity on top). */
	sortTimestamp?: string;
	status: {
		label: string;
		icon: ComponentType; // Component type
		color: string;
	};
	txStatus?: 'confirmed' | 'pending' | 'failed'; // Normalized status for balance logic
	network: 'rsk' | 'bsc' | 'arb' | 'lightning';

	// Computed transaction classification
	type: 'send' | 'receive' | 'swap' | 'contract';
	subType?: 'lock' | 'claim' | 'refund'; // for swaps
	methodName?: string; // decoded method name (camelCase from contract)

	// Display properties (computed once for performance)
	displayType: 'send' | 'receive' | 'swap-claim' | 'contract-function';
	borderColor: 'warning' | 'success' | 'info' | 'neutral' | 'error';
	iconConfig: {
		base: Record<string, unknown>; // Icon component for rendering
		overlay: ComponentType | null; // Overlay icon component (for contract interactions)
	};
	title: string; // Translation key for title (e.g., 'wallet.transaction.funds_released')

	// Network information (computed once)
	networkIcon: string;
	networkDisplayName: string;
	explorerUrl: string | null;

	// Financial details
	feeSats: number;
	balanceAfter: number; // Running balance after this transaction

	// Raw data for advanced use
	rawMethod?: string; // method selector
	decodedInput?: Record<string, unknown> | string;

	// Sorting hint applied by merge logic
	sortTimestamp?: string;

	// Token info for BSC
	tokenSymbol?: string;

	// Swap-specific fields
	swap?: {
		id: string; // Present if this is a swap transaction
		type: 'submarine' | 'reverse' | 'chain';
		actions: SwapAction[]; // Available actions for failed swaps
		rawStatus: string; // Raw Boltz API status for comparison
	};
}

/**
 * Swap action interface for failed swaps
 */
export interface SwapAction {
	type: 'refund' | 'renegotiate' | 'claim' | 'viewQR';
	label: string; // Translation key
	handler: () => Promise<void>;
}

export interface BidEscrowDetails {
	freelancerAddress: string;
	baseAmount: string;
	totalAmount: string;
	clientFee: string;
	freelancerFee: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	clientFeeTier: FeeTier;
	freelancerFeeTier: FeeTier;
}

export interface BidAcceptanceResult {
	success: boolean;
	transactionResult?: ContractTransactionResult;
	error?: string;
}

// ---------------------------------------------------------------------------
// EIP-7702 Delegation & Gas Abstraction Types (Phase 1.6)
// ---------------------------------------------------------------------------

/**
 * EIP-7702 delegation state machine.
 *
 * IDLE -> AUTH_SIGNING -> AUTH_SIGNED -> TX1_SUBMITTED -> TX1_MINED
 *     -> CLEANUP_NEEDED -> TX2_SUBMITTED -> TX2_MINED -> IDLE
 * TX1_MINED --(timeout)--> RECOVERY_NEEDED
 * TX2_MINED --(timeout)--> RECOVERY_NEEDED
 */
export type DelegationState =
	| 'IDLE'
	| 'AUTH_SIGNING'
	| 'AUTH_SIGNED'
	| 'TX1_SUBMITTED'
	| 'TX1_MINED'
	| 'CLEANUP_NEEDED'
	| 'TX2_SUBMITTED'
	| 'TX2_MINED'
	| 'RECOVERY_NEEDED';

/**
 * Gas payment mode.
 * - 'USDT_GAS': User-facing default -- gas paid in USDT via EIP-7702 delegation.
 * - 'BNB_FALLBACK': Hidden emergency path -- gas paid with BNB when paymaster is
 *   unavailable. Never surfaced in UI.
 */
export type GasMode = 'USDT_GAS' | 'BNB_FALLBACK';

/**
 * Environment discriminator for chain configuration.
 */
export type ChainEnvironment = 'mainnet' | 'testnet';

/**
 * Represents a token amount on a specific chain.
 */
export interface TokenAmount {
	token: string;
	chainId: number;
	amount: string; // Raw amount in smallest unit (BigInt serialised)
	formattedAmount: string; // Human-readable amount
	usdValue?: number;
}

/**
 * Persistent journal entry recording a single delegation lifecycle.
 * Stored in Capacitor Preferences for recovery across app restarts.
 */
export interface DelegationJournalEntry {
	id: string;
	state: DelegationState;
	tx1Hash?: string;
	tx2Hash?: string;
	timestamp: number;
	chainId: number;
}
