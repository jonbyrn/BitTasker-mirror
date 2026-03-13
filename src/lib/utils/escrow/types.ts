/**
 * Shared types and interfaces for Escrow Version Management System
 *
 * This file defines the core interfaces that ALL version handlers must implement
 * to ensure consistent API across different escrow contract versions.
 */
import type { NostrBidContent, NostrEventWithFollowup } from '$lib/types/bid';
import type {
	ContractCreationEvent,
	ContractFilter,
	ContractWithEvents,
	CreateContractParams,
	PendingContractCreation,
	PublishContractStatusParams,
	PublishStatusParams
} from '$lib/types/contract';
import type { Attachment, Task } from '$lib/types/task';
import type {
	ContractTransactionResult,
	EscrowData,
	BidAcceptanceResult,
	BidEscrowDetails
} from '$lib/types/wallet';
import type { FeeTier } from '@bittasker/wallet-core';
import type { NostrEvent } from 'nostr-tools';
import type { Writable } from 'svelte/store';
import type { EscrowError } from '../helpers/escrowErrors';
import type { InterfaceAbi } from 'ethers';

/**
 * Core Escrow Handler Interface
 * All version-specific escrow implementations must implement this interface
 */
export interface IEscrowHandler {
	// ============================================
	// Core Operations (Required for ALL versions)
	// ============================================

	/**
	 * Create new escrow contract
	 * @param freelancerAddress - Freelancer's blockchain address
	 * @param baseAmount - Base payment amount in RBTC
	 * @param estimatedStartTime - Unix timestamp for estimated start
	 * @param estimatedCompletionTime - Unix timestamp for estimated completion
	 * @param clientFeeTier - Client's fee tier
	 * @param freelancerFeeTier - Freelancer's fee tier
	 * @returns Transaction result with escrow ID
	 */
	createEscrow(
		freelancerAddress: string,
		baseAmount: string,
		estimatedStartTime: number,
		estimatedCompletionTime: number,
		clientFeeTier: FeeTier,
		freelancerFeeTier: FeeTier
	): Promise<ContractTransactionResult>;

	/**
	 * Load escrow details from blockchain
	 * @param escrowId - Unique escrow identifier
	 * @param contractAddress - Optional contract address for legacy contracts
	 * @returns Escrow data from blockchain
	 */
	loadEscrowDetails(escrowId: string, contractAddress?: string): Promise<EscrowData>;

	/**
	 * Mark task as complete (freelancer action)
	 * @param escrowId - Unique escrow identifier
	 * @param contractEventId - Optional contract event ID for Nostr publishing
	 * @param completionAttachments - Optional completion attachments
	 * @returns Transaction result
	 */
	completeTask(
		escrowId: string,
		contractEventId?: string,
		completionAttachments?: Attachment[]
	): Promise<ContractTransactionResult>;

	/**
	 * Accept completed task and release funds (client action)
	 * @param escrowId - Unique escrow identifier
	 * @param contractEventId - Optional contract event ID for Nostr publishing
	 * @param options - Optional callbacks (e.g. onConfirmed for task status update after chain confirm)
	 * @returns Transaction result
	 */
	acceptTask(
		escrowId: string,
		contractEventId?: string,
		options?: { onConfirmed?: () => Promise<void> }
	): Promise<ContractTransactionResult>;

	/**
	 * Cancel escrow and refund client
	 * @param escrowId - Unique escrow identifier
	 * @param contractEventId - Optional contract event ID for Nostr publishing
	 * @returns Transaction result
	 */
	cancelEscrow(escrowId: string, contractEventId?: string): Promise<ContractTransactionResult>;

	// ============================================
	// Dispute Operations (Required for ALL versions)
	// ============================================

	/**
	 * Initiate dispute on completed task
	 * @param escrowId - Unique escrow identifier
	 * @param contractEventId - Optional contract event ID for Nostr publishing
	 * @returns Transaction result
	 */
	disputeTask(escrowId: string, contractEventId?: string): Promise<ContractTransactionResult>;

	/**
	 * Propose resolution for dispute
	 * @param escrowId - Unique escrow identifier
	 * @param freelancerAmount - Amount to be paid to freelancer in RBTC
	 * @param contractEventId - Optional contract event ID for Nostr publishing
	 * @param proposedClientAmount - Optional client amount for Nostr publishing
	 * @param proposedFreelancerAmount - Optional freelancer amount for Nostr publishing
	 * @returns Transaction result
	 */
	proposeResolution(
		escrowId: string,
		freelancerAmount: string,
		contractEventId?: string,
		proposedClientAmount?: string,
		proposedFreelancerAmount?: string
	): Promise<ContractTransactionResult>;

	/**
	 * Accept proposed resolution
	 * @param escrowId - Unique escrow identifier
	 * @param contractEventId - Optional contract event ID for Nostr publishing
	 * @param options - Optional callbacks (e.g. onConfirmed for task status update after chain confirm)
	 * @returns Transaction result
	 */
	acceptProposal(
		escrowId: string,
		contractEventId?: string,
		options?: { onConfirmed?: () => Promise<void> }
	): Promise<ContractTransactionResult>;

	/**
	 * Resolve dispute after timelock expires
	 * @param escrowId - Unique escrow identifier
	 * @param escrowStatus - Current escrow status (EscrowStatus enum value)
	 * @param contractEventId - Optional contract event ID for Nostr publishing
	 * @param options - Optional callbacks (e.g. onConfirmed when outcome is FundsReleased)
	 * @returns Transaction result
	 */
	resolveAfterTimelock(
		escrowId: string,
		escrowStatus: number,
		contractEventId?: string,
		options?: { onConfirmed?: () => Promise<void> }
	): Promise<ContractTransactionResult>;

	// ============================================
	// V2+ Operations (Optional - not all versions have these)
	// ============================================

	/**
	 * Mark work as in progress (V2+)
	 * @param escrowId - Unique escrow identifier
	 * @param contractAddress - Optional contract address for legacy contracts
	 * @returns Transaction result
	 */
	markWorkInProgress?(
		escrowId: string,
		contractAddress?: string,
		contractEventId?: string
	): Promise<ContractTransactionResult>;

	/**
	 * Mark freelancer as no-show (V2+)
	 * @param escrowId - Unique escrow identifier
	 * @param contractAddress - Optional contract address for legacy contracts
	 * @returns Transaction result
	 */
	markNoShow?(
		escrowId: string,
		contractAddress?: string,
		contractEventId?: string
	): Promise<ContractTransactionResult>;

	/**
	 * Claim refund after no-show (V2+)
	 * @param escrowId - Unique escrow identifier
	 * @param contractAddress - Optional contract address for legacy contracts
	 * @returns Transaction result
	 */
	claimNoShowRefund?(
		escrowId: string,
		contractAddress?: string,
		contractEventId?: string
	): Promise<ContractTransactionResult>;

	/**
	 * Claim upfront deposit (V2+)
	 * @param escrowId - Unique escrow identifier
	 * @param contractAddress - Optional contract address for legacy contracts
	 * @returns Transaction result
	 */
	claimUpfrontDeposit?(
		escrowId: string,
		contractAddress?: string,
		contractEventId?: string
	): Promise<ContractTransactionResult>;

	/**
	 * Check escrow funding status
	 * @param escrowId - Unique escrow identifier
	 * @returns Object with wasFunded flag and escrow data if it exists
	 */
	checkEscrowFundingStatus(escrowId: string): Promise<{
		wasFunded: boolean;
		escrowData: EscrowData | null;
		error?: EscrowError;
	}>;
}

/**
 * Escrow Bid Handler Interface
 * Handles bid acceptance and escrow creation from bids
 */
export interface IEscrowBidHandler {
	/**
	 * Accept bid and create escrow contract
	 * @param bid - Nostr bid event with followup
	 * @param task - Nostr task event
	 * @param btcPrice - Current BTC price in USD
	 * @param network - Blockchain network to use: 'RSK' | 'BSC'
	 * @returns Bid acceptance result
	 */
	acceptBidAndCreateEscrow(
		bid: NostrEventWithFollowup,
		task: NostrEvent,
		btcPrice: number,
		network: 'RSK' | 'BSC'
	): Promise<BidAcceptanceResult>;

	/**
	 * Calculate escrow details from bid
	 * @param bid - Bid content
	 * @param task - Task details
	 * @param btcPrice - Current BTC price in USD
	 * @returns Calculated escrow details
	 */
	calculateBidEscrowDetails(bid: NostrBidContent, task: Task, btcPrice: number): BidEscrowDetails;
}

/**
 * Nostr Contract Handler Interface
 * Manages Nostr events for contract creation and status updates
 */
export interface INostrContractHandler {
	/**
	 * Publish contract creation event to Nostr
	 * @param params - Create contract parameters
	 * @returns Promise that resolves when the contract is published
	 */
	publishContractEvent(params: CreateContractParams): Promise<void>;

	/**
	 * Publish contract status update for a contract (as encrypted DM)
	 * @param params - Publish contract status parameters
	 * @returns Promise that resolves when the status is published
	 */
	publishContractStatus(params: PublishStatusParams): Promise<void>;

	/**
	 * Get all contracts where the user is either client or freelancer
	 * @param filter - Filter options
	 * @returns Array of contract with events
	 *
	 * Filter breakdown:
	 * - escrowIds: Array of escrow IDs to filter by
	 * - taskIds: Array of task IDs to filter by
	 * - statuses: Array of statuses to filter by
	 * - userPubkey: The pubkey of the user to filter by
	 * - limit: The number of contracts to return
	 * - since: The timestamp to start from
	 * - until: The timestamp to end at
	 *
	 * @example
	 * // Get first page of contracts
	 * const contracts = await getContracts({ limit: 5 });
	 *
	 * @example
	 * // Get next page of contracts
	 * const contracts = await getContracts({ limit: 5, until: oldestTimestamp });
	 */
	getContracts(filter: ContractFilter): Promise<ContractWithEvents[]>;

	/**
	 * Delete contract from Nostr (only if never funded)
	 * @param contractEventId - The ID of the contract event to delete
	 * @param escrowId - Unique escrow identifier
	 * @returns Promise that resolves when deletion is complete
	 */
	deleteContract(contractEventId: string, escrowId: string): Promise<void>;

	/**
	 * Handle incoming status update event from Nostr
	 * Subscribe to websocket status events
	 * @param event - Nostr event containing status update
	 * @returns Promise that resolves when event is handled
	 */
	handleStatusEvent(event: NostrEvent): Promise<void>;

	/**
	 * Handle incoming contract creation event from Nostr
	 * Subscribe to websocket contract events
	 * @param event - Nostr event containing contract data
	 * @returns Promise that resolves when event is handled
	 */
	handleContractEvent(event: NostrEvent): Promise<void>;
}

export interface IEscrowNostrEvents {
	/**
	 * Unified function to publish contract status to Nostr and show appropriate toast
	 *
	 * Call with PENDING status (e.g., PendingCompletion) BEFORE transaction broadcast
	 * Call with CONFIRMED status (e.g., Completed) AFTER transaction confirmation
	 *
	 * This function handles:
	 * - Publishing status to Nostr
	 * - Showing appropriate toast (info for pending, success for confirmed, error on failure)
	 * - All message translations
	 *
	 * @example
	 * // Before transaction
	 * await publishEscrowStatus({ status: EscrowStatus.PendingCompletion, ... });
	 *
	 * // After confirmation
	 * await publishEscrowStatus({ status: EscrowStatus.Completed, ... });
	 */
	publishEscrowStatus(params: PublishContractStatusParams): Promise<void>;

	/**
	 * Register pending contract by transaction hash (before we have escrow ID)
	 * @param params - Pending contract parameters
	 */
	registerPendingContractByTxHash(params: Omit<PendingContractCreation, 'escrowId'>): void;

	/**
	 * Cleanup pending contract by transaction hash (called when transaction fails)
	 * @param transactionHash - Transaction hash to cleanup
	 */
	cleanupPendingContractByTxHash(transactionHash: string): void;

	/**
	 * Contract creation store (Svelte writable)
	 * Used to track contract creation events
	 */
	contractCreationStore: Writable<ContractCreationEvent | null>;
}

/**
 * Version Handler Interface
 * Complete interface for a version-specific escrow implementation
 */
export interface IVersionHandler {
	/** Escrow operations handler */
	escrow: IEscrowHandler;

	/** Bid-related operations handler */
	escrowBid: IEscrowBidHandler;

	/** Nostr contract operations handler */
	nostrContract: INostrContractHandler;

	/** Escrow events handler (stores, pending contracts) */
	escrowEvents: IEscrowNostrEvents;

	/** Version-specific status enum (TypeScript enum type) */
	EscrowStatus: {
		readonly [key: string]: string | number;
		readonly [key: number]: string;
	};

	/** ABI JSON for contract interaction */
	abi: InterfaceAbi;
}
