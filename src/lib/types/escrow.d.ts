import type { ContractInterface, Log } from 'ethers';

/**
 * BSC Escrow Event Types
 */
export type BscEscrowEventType = 'CREATED' | 'FUNDED' | 'COMPLETED' | 'DISPUTED' | 'RELEASED';

/**
 * Parameters for creating an escrow on BSC
 */
export interface BscEscrowCreationParams {
	// Contract details
	contractAddress: string;
	escrowContractAbi: ContractInterface | null;

	// Transaction signer
	signer?: any; // ethers.Signer (optional if using default wallet)

	// Addresses
	senderAddress: string;
	recipientAddress: string;

	// Amount in USDT (token units, 6 decimals)
	amountUSDT: string;

	// Optional metadata
	escrowId?: string;
	taskId?: string;
}

/**
 * Decoded BSC escrow event from blockchain log
 */
export interface BscEscrowEvent {
	type: BscEscrowEventType;
	escrowId: string;
	senderAddress: string;
	recipientAddress: string;
	amountUSDT: string; // Formatted from 6 decimals
	status: string;
	timestamp: number;
	blockNumber: number;
	transactionHash: string;
}

/**
 * ABI loading result with caching metadata
 */
export interface AbiLoadResult {
	abi: ContractInterface;
	source: 'deployed' | 'cached';
	chainId: number;
	timestamp: number;
}
