/**
 * Global Escrow Manager
 *
 * Single entry point for all escrow operations across multiple contract versions.
 * Automatically routes operations to the correct version handler based on contract metadata.
 *
 * Key Features:
 * - Static imports (no dynamic loading) for optimal performance
 * - Version detection from Nostr tags
 * - Capability-based API (UI asks "can I do this?" not "what version?")
 * - Forward compatible (unknown versions default to LATEST)
 * - Infinitely scalable (just add new versions to registry)
 * - Modular architecture with access patterns for operations
 */

import type { EscrowVersion, IVersionHandler } from './types';
import { updateTask } from '$lib/nostr/task';
import { getNpub } from '../nostrKeys';
import { nip19, type NostrEvent } from 'nostr-tools';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import type {
	ContractFilter,
	ContractWithEvents,
	CreateContractParams,
	PublishStatusParams,
	PublishContractStatusParams,
	PendingContractCreation
} from '$lib/types/contract';
import type { BidEscrowDetails, ContractTransactionResult, EscrowData } from '$lib/types/wallet';

// Static imports - all versions loaded at startup for optimal performance
import type { FeeTier } from '@bittasker/wallet-core';
import type { NostrBidContent, NostrEventWithFollowup } from '$lib/types/bid';
import type { Attachment, Task } from '$lib/types/task';
import type { Writable } from 'svelte/store';

import * as v1 from './v1';
// import * as v2 from './v2';
// import * as v3 from './v3'; // Future versions

// TODO: Refactor implementation to avoid imports from v1 folder
import {
	formatRBTCAmount,
	getFeePercentageDisplay,
	validateEscrowDetails,
	validateSufficientBalance
} from './v1/escrowBid';

/**
 * Version Registry
 * Add new versions here as they're implemented
 */
const VERSION_HANDLERS: Record<string, IVersionHandler> = {
	v1: v1
	// 'v2': v2,
	// 'v3': v3, // Just add new versions here
};

/**
 * Latest Version
 * Update this when releasing a new version
 * New contracts will always use this version
 */
export const LATEST_ESCROW_VERSION: EscrowVersion = 'v1';

/**
 * Global Escrow Manager Class
 * Provides version-agnostic API for all escrow operations
 */
class EscrowManager {
	private requireContractIdentifiers(
		contract: ContractWithEvents,
		actionName: 'cancelEscrow' | 'refundClient'
	): { escrowId: string; contractEventId: string } {
		const escrowId = contract?.escrowData?.id;
		if (typeof escrowId !== 'string' || escrowId.trim() === '') {
			throw new Error(`Missing escrow id for ${actionName}`);
		}

		const contractEventId = contract?.contractEvent?.id;
		if (typeof contractEventId !== 'string' || contractEventId.trim() === '') {
			throw new Error(`Missing contract event id for ${actionName}`);
		}

		return { escrowId, contractEventId };
	}

	/**
	 * Get handler for specific version
	 * Defaults to LATEST if version not found (forward compatibility)
	 */
	private getHandler(version: string): IVersionHandler {
		if (!(version in VERSION_HANDLERS)) {
			return VERSION_HANDLERS[LATEST_ESCROW_VERSION];
		}
		return VERSION_HANDLERS[version];
	}

	/**
	 * Extract version from contract tags
	 * Defaults to v1 if no version tag found (backward compatibility)
	 */
	getVersionFromContract(contract: ContractWithEvents): string {
		// Check if contract has tags array in contractEvent
		if (!contract.contractEvent.tags || !Array.isArray(contract.contractEvent.tags)) {
			return LATEST_ESCROW_VERSION;
		}

		// Look for version tag ['v', 'v1']
		const versionTag = contract.contractEvent.tags.find((tag: string[]) => tag[0] === 'v');
		return versionTag?.[1] || LATEST_ESCROW_VERSION;
	}

	/**
	 * Hex pubkey of the counterparty for encrypted contract-status DMs (not npub).
	 */
	async getRecipientPubkey(contract: ContractWithEvents): Promise<string> {
		let npub = await getNpub();
		if (npub.startsWith('npub')) {
			npub = nip19.decode(npub).data as string;
		}

		const content = contract?.contractEvent?.content;

		// Determine recipient: if sender is client, send to freelancer, and vice versa
		const recipientPubkey =
			npub === content?.clientPubkey ? content?.freelancerPubkey : content?.clientPubkey;

		return recipientPubkey || '';
	}

	// ============================================
	// MODULAR OPERATION HANDLERS
	// ============================================

	/**
	 * Escrow Operations Handler
	 * Access pattern: escrow.escrowOps.methodName()
	 */
	readonly escrowOps = {
		/**
		 * Create new escrow (always uses LATEST version)
		 */
		createEscrow: async (
			freelancerAddress: string,
			baseAmount: string,
			estimatedStartTime: number,
			estimatedCompletionTime: number,
			clientFeeTier: FeeTier,
			freelancerFeeTier: FeeTier
		): Promise<ContractTransactionResult> => {
			const handler = this.getHandler(LATEST_ESCROW_VERSION);
			return handler.escrow.createEscrow(
				freelancerAddress,
				baseAmount,
				estimatedStartTime,
				estimatedCompletionTime,
				clientFeeTier,
				freelancerFeeTier
			);
		},

		/**
		 * Load escrow details (version-aware from contract)
		 */
		loadEscrowDetails: async (contract: ContractWithEvents): Promise<EscrowData> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const escrowId = contract.escrowData.id;
			const contractAddress = contract.contractEvent.content.contractAddress;

			return handler.escrow.loadEscrowDetails(escrowId, contractAddress);
		},

		/**
		 * Complete task (version-aware from contract)
		 */
		completeTask: async (
			contract: ContractWithEvents,
			completionAttachments?: Attachment[]
		): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const escrowId = contract.escrowData.id;
			const contractEventId = contract.contractEvent.id;
			const recipientPubkey = await this.getRecipientPubkey(contract);

			return handler.escrow.completeTask(
				escrowId,
				recipientPubkey,
				contractEventId,
				completionAttachments
			);
		},

		/**
		 * Accept task (version-aware from contract)
		 */
		acceptTask: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const escrowId = contract.escrowData.id;
			const contractEventId = contract.contractEvent.id;
			const taskId = contract.contractEvent.content?.taskId as string | undefined;

			const onConfirmed = taskId
				? async () => {
						await updateTask(taskId, { status: TaskStatusEnum.COMPLETED });
					}
				: undefined;

			const recipientPubkey = await this.getRecipientPubkey(contract);

			return handler.escrow.acceptTask(escrowId, recipientPubkey, contractEventId, { onConfirmed });
		},

		/**
		 * Cancel escrow (version-aware from contract)
		 */
		cancelEscrow: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const { escrowId, contractEventId } = this.requireContractIdentifiers(
				contract,
				'cancelEscrow'
			);

			const recipientPubkey = await this.getRecipientPubkey(contract);

			return handler.escrow.cancelEscrow(escrowId, recipientPubkey, contractEventId);
		},

		/**
		 * Refund client (version-aware from contract)
		 */
		refundClient: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const { escrowId, contractEventId } = this.requireContractIdentifiers(
				contract,
				'refundClient'
			);

			const recipientPubkey = await this.getRecipientPubkey(contract);

			return handler.escrow.refundClient(escrowId, recipientPubkey, contractEventId);
		},

		/**
		 * Dispute task (version-aware from contract)
		 */
		disputeTask: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const escrowId = contract.escrowData.id;
			const contractEventId = contract.contractEvent.id;

			const recipientPubkey = await this.getRecipientPubkey(contract);

			return handler.escrow.disputeTask(escrowId, recipientPubkey, contractEventId);
		},

		/**
		 * Propose resolution (version-aware from contract)
		 */
		proposeResolution: async (
			contract: ContractWithEvents,
			freelancerAmountRBTC: string,
			proposedClientAmount?: string,
			proposedFreelancerAmount?: string
		): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const escrowId = contract.escrowData.id;
			const contractEventId = contract.contractEvent.id;

			const recipientPubkey = await this.getRecipientPubkey(contract);

			return handler.escrow.proposeResolution(
				escrowId,
				recipientPubkey,
				freelancerAmountRBTC,
				contractEventId,
				proposedClientAmount,
				proposedFreelancerAmount
			);
		},

		/**
		 * Accept proposal (version-aware from contract)
		 * Only updates Nostr task to COMPLETED when the Tasker (client) accepts - not when Taskee accepts.
		 */
		acceptProposal: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const escrowId = contract.escrowData.id;
			const contractEventId = contract.contractEvent.id;
			const taskId = contract.contractEvent.content?.taskId as string | undefined;

			// Only update task when Tasker (client) accepts - Taskee accepting should not update the task event
			const onConfirmed =
				taskId && contract.isClient
					? async () => {
							await updateTask(taskId, { status: TaskStatusEnum.COMPLETED });
						}
					: undefined;

			const recipientPubkey = await this.getRecipientPubkey(contract);

			return handler.escrow.acceptProposal(escrowId, recipientPubkey, contractEventId, {
				onConfirmed
			});
		},

		/**
		 * Resolve after timelock (version-aware from contract)
		 */
		resolveAfterTimelock: async (
			contract: ContractWithEvents
		): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const escrowId = contract.escrowData.id;
			const contractEventId = contract.contractEvent.id;
			const escrowStatus = contract.escrowData.status;
			const taskId = contract.contractEvent.content?.taskId as string | undefined;

			const onConfirmed = taskId
				? async () => {
						await updateTask(taskId, { status: TaskStatusEnum.COMPLETED });
					}
				: undefined;

			const recipientPubkey = await this.getRecipientPubkey(contract);

			return handler.escrow.resolveAfterTimelock(
				escrowId,
				recipientPubkey,
				Number(escrowStatus),
				contractEventId,
				{
					onConfirmed
				}
			);
		},

		// V2+ Operations (with capability checks)
		markWorkInProgress: async (
			contract: ContractWithEvents
		): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			if (!handler.escrow.markWorkInProgress) {
				throw new Error('markWorkInProgress not supported for this contract version');
			}

			const escrowId = contract.escrowData.id;
			const contractAddress = contract.contractEvent.content.contractAddress;

			return handler.escrow.markWorkInProgress(escrowId, contractAddress);
		},

		markNoShow: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			if (!handler.escrow.markNoShow) {
				throw new Error('markNoShow not supported for this contract version');
			}

			const escrowId = contract.escrowData.id;
			const contractAddress = contract.contractEvent.content.contractAddress;

			return handler.escrow.markNoShow(escrowId, contractAddress);
		},

		claimNoShowRefund: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			if (!handler.escrow.claimNoShowRefund) {
				throw new Error('claimNoShowRefund not supported for this contract version');
			}

			const escrowId = contract.escrowData.id;
			const contractAddress = contract.contractEvent.content.contractAddress;

			return handler.escrow.claimNoShowRefund(escrowId, contractAddress);
		},

		claimUpfrontDeposit: async (
			contract: ContractWithEvents
		): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			if (!handler.escrow.claimUpfrontDeposit) {
				throw new Error('claimUpfrontDeposit not supported for this contract version');
			}

			const escrowId = contract.escrowData.id;
			const contractAddress = contract.contractEvent.content.contractAddress;

			return handler.escrow.claimUpfrontDeposit(escrowId, contractAddress);
		},

		/**
		 * Check escrow funding status (version-aware from contract)
		 */
		checkEscrowFundingStatus: async (contract: ContractWithEvents) => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const escrowId = contract.escrowData.id;

			return handler.escrow.checkEscrowFundingStatus(escrowId);
		}
	};

	/**
	 * Bid Operations Handler
	 * Access pattern: escrow.bidOps.methodName()
	 */
	readonly bidOps = {
		/**
		 * Accept bid and create escrow (always uses LATEST version)
		 */
		acceptBidAndCreateEscrow: async (
			bid: NostrEventWithFollowup,
			task: NostrEvent,
			btcPrice: number,
			network: 'RSK' | 'BSC'
		) => {
			const handler = this.getHandler(LATEST_ESCROW_VERSION);
			return handler.escrowBid.acceptBidAndCreateEscrow(bid, task, btcPrice, network);
		},

		/**
		 * Calculate bid escrow details (always uses LATEST version)
		 */
		calculateBidEscrowDetails: (
			bid: NostrBidContent,
			task: Task,
			btcPrice: number
		): BidEscrowDetails => {
			const handler = this.getHandler(LATEST_ESCROW_VERSION);
			return handler.escrowBid.calculateBidEscrowDetails(bid, task, btcPrice);
		},

		/**
		 * Validate escrow details (always uses LATEST version)
		 */
		validateEscrowDetails: (details: BidEscrowDetails) => {
			return validateEscrowDetails(details);
		},

		/**
		 * Validate sufficient balance (always uses LATEST version)
		 */
		validateSufficientBalance: (details: BidEscrowDetails): string[] => {
			return validateSufficientBalance(details);
		},

		/**
		 * Get fee percentage display (always uses LATEST version)
		 */
		getFeePercentageDisplay: (tier: FeeTier): string => {
			return getFeePercentageDisplay(tier);
		},

		/**
		 * Format RBTC amount (always uses LATEST version)
		 */
		formatRBTCAmount: (amount: string): string => {
			return formatRBTCAmount(amount);
		}
	};

	/**
	 * Contract Operations Handler (Nostr)
	 * Access pattern: escrow.contractOps.methodName()
	 */
	readonly contractOps = {
		/**
		 * Publish contract event (always uses LATEST version)
		 */
		publishContractEvent: async (params: CreateContractParams): Promise<void> => {
			const handler = this.getHandler(LATEST_ESCROW_VERSION);
			return handler.nostrContract.publishContractEvent(params);
		},

		/**
		 * Update contract status (version-aware from contract)
		 */
		publishContractStatus: async (
			contract: ContractWithEvents,
			params: PublishStatusParams
		): Promise<void> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);
			return handler.nostrContract.publishContractStatus(params);
		},

		/**
		 * Get contracts from Nostr (uses LATEST to fetch all, version extracted per contract)
		 */
		getContracts: async (filter?: ContractFilter): Promise<ContractWithEvents[]> => {
			const handler = this.getHandler(LATEST_ESCROW_VERSION);
			return handler.nostrContract.getContracts(filter || {});
		},

		/**
		 * Delete contract from Nostr (version-aware from contract)
		 */
		deleteContract: async (contract: ContractWithEvents): Promise<void> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const contractEventId = contract.contractEvent.id;
			const escrowId = contract.escrowData.id;

			return handler.nostrContract.deleteContract(contractEventId, escrowId);
		},

		/**
		 * Handle incoming status update event from Nostr (version extracted from event)
		 */
		handleStatusEvent: async (event: NostrEvent): Promise<void> => {
			// Extract version from event tags
			const versionTag = event.tags?.find((tag: string[]) => tag[0] === 'v');
			const version = versionTag?.[1] || LATEST_ESCROW_VERSION;
			const handler = this.getHandler(version);
			return handler.nostrContract.handleStatusEvent(event);
		},

		/**
		 * Handle incoming contract creation event from Nostr (version extracted from event)
		 */
		handleContractEvent: async (event: NostrEvent): Promise<void> => {
			// Extract version from event tags
			const versionTag = event.tags?.find((tag: string[]) => tag[0] === 'v');
			const version = versionTag?.[1] || LATEST_ESCROW_VERSION;
			const handler = this.getHandler(version);
			return handler.nostrContract.handleContractEvent(event);
		}
	};

	/**
	 * Event Operations Handler (Pending Contracts & Stores)
	 * Access pattern: escrow.eventOps.methodName()
	 */
	readonly eventOps = {
		/**
		 * Register pending contract by transaction hash (always uses LATEST)
		 */
		registerPendingContractByTxHash: (params: Omit<PendingContractCreation, 'escrowId'>): void => {
			const handler = this.getHandler(LATEST_ESCROW_VERSION);
			return handler.escrowEvents.registerPendingContractByTxHash(params);
		},

		/**
		 * Cleanup pending contract by transaction hash (always uses LATEST)
		 */
		cleanupPendingContractByTxHash: (transactionHash: string): void => {
			const handler = this.getHandler(LATEST_ESCROW_VERSION);
			return handler.escrowEvents.cleanupPendingContractByTxHash(transactionHash);
		},

		/**
		 * Get contract creation store (always uses LATEST)
		 */
		getContractCreationStore: (): Writable<{
			escrowId?: string;
			contractEventId?: string;
			transactionHash?: string;
			transactionHashes?: string[];
			error?: string;
		} | null> => {
			const handler = this.getHandler(LATEST_ESCROW_VERSION);
			return handler.escrowEvents.contractCreationStore;
		},

		/**
		 * Publish escrow status to Nostr (version-aware from contract)
		 */
		publishEscrowStatus: async (
			contract: ContractWithEvents,
			params: PublishContractStatusParams
		): Promise<void> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);
			return handler.escrowEvents.publishEscrowStatus(params);
		}
	};

	// ============================================
	// CAPABILITY CHECKS (Version-Agnostic)
	// ============================================

	/**
	 * Generic capability check
	 */
	hasFeature(contract: ContractWithEvents, feature: string): boolean {
		const version = this.getVersionFromContract(contract);
		const handler = this.getHandler(version);
		const escrowHandler = handler.escrow as unknown as Record<string, unknown>;
		return typeof escrowHandler[feature] === 'function';
	}

	// ============================================
	// ABI ACCESS
	// ============================================

	/**
	 * Get ABI for specific version
	 */
	getABI(version?: string) {
		const handler = this.getHandler(version || LATEST_ESCROW_VERSION);
		return handler.abi;
	}

	/**
	 * Get ABI for a specific contract (version-aware)
	 */
	getABIForContract(contract: ContractWithEvents) {
		const version = this.getVersionFromContract(contract);
		return this.getABI(version);
	}

	// ============================================
	// UTILITY FUNCTIONS
	// ============================================

	/**
	 * Get latest version identifier
	 */
	getLatestVersion(): EscrowVersion {
		return LATEST_ESCROW_VERSION;
	}

	/**
	 * Check if version is supported
	 */
	isVersionSupported(version: string): boolean {
		return version in VERSION_HANDLERS;
	}

	/**
	 * Get all supported versions
	 */
	getSupportedVersions(): EscrowVersion[] {
		return Object.keys(VERSION_HANDLERS) as EscrowVersion[];
	}

	/**
	 * Get version-specific enum
	 * Returns LATEST version enum if contract is not provided
	 */
	getEscrowStatus(contract?: ContractWithEvents) {
		const version = contract ? this.getVersionFromContract(contract) : LATEST_ESCROW_VERSION;
		const handler = this.getHandler(version);
		return handler.EscrowStatus;
	}
}

// Export singleton instance
export const escrow = new EscrowManager();

// Export types for external use
export type { EscrowVersion };

// Re-export types
export type {
	IVersionHandler,
	IEscrowHandler,
	IEscrowBidHandler,
	INostrContractHandler
} from './types';

// Re-export utility types from escrowBid for convenience
export type { ValidationWarning, ValidationResult } from './v1/escrowBid';

// Re-export EscrowStatus enum from v1 (for backward compatibility and type imports)
export { EscrowStatus } from './v1/escrow.enum';

// TODO: Implementation not working as expected, fix later
// Export EscrowStatus as a type derived from the return type of getEscrowStatus
// This makes the type version-aware and dynamic
// export type EscrowStatus = ReturnType<typeof escrow.getEscrowStatus>;
