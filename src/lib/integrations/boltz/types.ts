/**
 * Boltz Exchange API Types
 * Based on the Boltz REST API documentation
 */

export interface BoltzConfig {
	apiUrl: string;
	network: 'mainnet' | 'testnet';
	timeout?: number;
}

export interface SwapPair {
	from: string;
	to: string;
	hash: string;
}

export interface SwapLimits {
	minimal: number;
	maximal: number;
}

export interface SwapPairs {
	[pair: string]: SwapLimits;
}

export interface SwapFees {
	percentage: number;
	miner: {
		normal: number;
		reverse: {
			lockup: number;
			claim: number;
		};
	};
}

// Normal swap (Lightning → Bitcoin)
export interface CreateSwapRequest {
	type: 'submarine';
	pairId: string;
	orderSide: 'sell'; // Always sell for submarine swaps
	invoice: string;
	refundPublicKey: string;
	referralId?: string;
}

export interface CreateSwapResponse {
	id: string;
	address: string;
	redeemScript: string;
	acceptZeroConf: boolean;
	expectedAmount: number;
	timeoutBlockHeight: number;
	blindingKey?: string; // For Liquid
}

// Reverse swap (Bitcoin → Lightning)
export interface CreateReverseSwapRequest {
	type: 'reversesubmarine';
	pairId: string;
	orderSide: 'buy'; // Always buy for reverse swaps
	invoiceAmount: number;
	preimageHash: string;
	claimPublicKey: string;
	referralId?: string;
}

export interface CreateReverseSwapResponse {
	id: string;
	invoice: string;
	redeemScript: string;
	lockupAddress: string;
	onchainAmount: number;
	timeoutBlockHeight: number;
	blindingKey?: string; // For Liquid
}

export interface SwapStatus {
	status: SwapStatusType;
	transaction?: {
		id: string;
		hex?: string;
		eta?: number;
	};
	failureReason?: string;
}

export type SwapStatusType = 
	| 'swap.created'
	| 'swap.expired'
	| 'invoice.set'
	| 'invoice.paid'
	| 'invoice.failedToPay'
	| 'invoice.pending'
	| 'invoice.settled'
	| 'invoice.expired'
	| 'transaction.mempool'
	| 'transaction.confirmed'
	| 'transaction.lockupFailed'
	| 'transaction.refunded'
	| 'transaction.failed'
	| 'transaction.claim.pending'
	| 'transaction.claim.failed'
	| 'swap.refunded';

export interface RefundSwapRequest {
	address: string;
	feePerVbyte?: number;
}

export interface RefundSwapResponse {
	transactionId: string;
	transactionHex: string;
}

export interface ClaimSwapRequest {
	preimage: string;
	address: string;
	feePerVbyte?: number;
}

export interface ClaimSwapResponse {
	transactionId: string;
	transactionHex: string;
}

export interface BroadcastTransactionRequest {
	transactionHex: string;
}

export interface BroadcastTransactionResponse {
	transactionId: string;
}

export interface SwapTransaction {
	id: string;
	hex: string;
	eta?: number;
}

// Swap monitoring interface
export interface SwapMonitor {
	swapId: string;
	type: 'submarine' | 'reversesubmarine';
	status: SwapStatusType;
	createdAt: Date;
	updatedAt: Date;
	pairId: string;
	amount: number;
	onchainAddress?: string;
	invoice?: string;
	preimageHash?: string;
	timeoutBlockHeight: number;
	failureReason?: string;
}

// Event types for swap monitoring
export interface SwapEvent {
	swapId: string;
	status: SwapStatusType;
	timestamp: Date;
	transaction?: SwapTransaction;
	failureReason?: string;
}

export type SwapEventCallback = (event: SwapEvent) => void;

// Cooperative claiming interfaces for Taproot swaps
export interface CooperativeClaimDetails {
	musig: any;
	transaction: any;
	partialSignature?: string;
}

export interface CooperativeClaimRequest {
	partialSignature: string;
	preimage?: string;
	transaction?: any;
}

export interface CooperativeClaimResponse {
	transactionId: string;
	transactionHex: string;
}

export interface CooperativeRefundRequest {
	transaction: any;
}

export interface CooperativeRefundResponse {
	partialSignature: string;
}

// Emergency recovery interfaces
export interface RefundFileData {
	id: string;
	currency: string;
	redeemScript: string;
	privateKey: string;
	timeoutBlockHeight: number;
}

export interface EmergencyRefundParams {
	refundData: RefundFileData;
	destinationAddress: string;
	feeRate: number;
	lockupTransaction: any; // Transaction type
	outputIndex: number;
}

export interface PreimageClaimParams {
	swapId: string;
	preimage: string;
	destinationAddress: string;
	lockupTransaction: any; // Transaction type
	outputIndex: number;
	redeemScript: string;
	claimPrivateKey: string;
	feeRate: number;
}

// Contract addresses for EVM chains
export interface ContractAddresses {
	[chain: string]: {
		erc20Swap: string;
		etherSwap: string;
	};
}