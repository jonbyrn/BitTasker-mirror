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

import type { IVersionHandler } from './types';
import { updateTask } from '$lib/nostr/task';
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
import type { NostrEvent } from 'nostr-tools';
import type { Attachment, Task } from '$lib/types/task';
import type { Writable } from 'svelte/store';

import { createDebug } from '$lib/utils/debug';
import * as v1 from './v1';
import * as v2 from './v2';
import { EscrowStatus as V2EscrowStatus } from './v2/escrow.enum';
// import * as v3 from './v3'; // Future versions

const d = createDebug('escrow:manager');

async function updateTaskAtSubmitTime(
	taskId: string | undefined,
	status: TaskStatusEnum,
	context: string,
	txHash?: string
): Promise<void> {
	if (!taskId) return;

	try {
		await updateTask(taskId, { status });
		d.log(`${context} task updated at submit-time`, {
			taskId,
			status,
			transactionHash: txHash ? `${txHash.slice(0, 18)}...` : undefined
		});
	} catch (error) {
		d.error(`${context} failed to update task at submit-time`, {
			taskId,
			status,
			error
		});
	}
}

// TODO: Refacotring needed
// These utilities are version-agnostic helpers (fee display, input validation).
// Imported from v2 since it is now the LATEST version. If v3 introduces
// breaking changes to these helpers, update this import accordingly.
import {
	formatRBTCAmount,
	getFeePercentageDisplay,
	validateEscrowDetails,
	validateSufficientBalance
} from './v2/escrowBid';

/**
 * Version Registry
 * Add new versions here as they're implemented
 */
const VERSION_HANDLERS: Record<string, IVersionHandler> = {
	v1: v1,
	v2: v2
	// v3: v3, // Just add new versions here
};

/**
 * Latest Version
 * Update this when releasing a new version AND registering it in VERSION_HANDLERS.
 * New contracts will always use this version.
 * ⚠️ Must match a key in VERSION_HANDLERS — pointing to an unregistered version
 *    causes getHandler() to silently fall back to v1 for ALL new contract operations.
 */
export const LATEST_ESCROW_VERSION = Object.keys(VERSION_HANDLERS).at(-1) || 'v1';

/**
 * Global Escrow Manager Class
 * Provides version-agnostic API for all escrow operations
 */
class EscrowManager {
	/**
	 * Get handler for specific version
	 * Defaults to LATEST if version not found (forward compatibility)
	 */
	private getHandler(version: string): IVersionHandler {
		// Fall back to v1 (always registered) rather than LATEST_ESCROW_VERSION,
		// which may not yet be registered during incremental V2 rollout.
		return VERSION_HANDLERS[version] ?? VERSION_HANDLERS['v1'];
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

		// Look for version tag ['v', 'v1'] — missing tag means original V1 contract
		const versionTag = contract.contractEvent.tags.find((tag: string[]) => tag[0] === 'v');
		return versionTag?.[1] || 'v1';
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
			d.log('completeTask route', {
				escrowId: contract.escrowData.id,
				version,
				useGasless: version === 'v2'
			});

			const escrowId = contract.escrowData.id;
			const contractEventId = contract.contractEvent.id;

			return handler.escrow.completeTask(escrowId, contractEventId, completionAttachments);
		},

		/**
		 * Accept task (version-aware from contract)
		 */
		acceptTask: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);
			d.log('acceptTask route', {
				escrowId: contract.escrowData.id,
				version,
				useGasless: version === 'v2'
			});

			const escrowId = contract.escrowData.id;
			const contractEventId = contract.contractEvent.id;
			const taskId = contract.contractEvent.content?.taskId as string | undefined;

			if (version === 'v2') {
				const result = await handler.escrow.acceptTask(escrowId, contractEventId);
				await updateTaskAtSubmitTime(taskId, TaskStatusEnum.COMPLETED, 'acceptTask', result.hash);
				return result;
			}

			const onConfirmed = taskId
				? async () => {
						await updateTask(taskId, { status: TaskStatusEnum.COMPLETED });
					}
				: undefined;

			return handler.escrow.acceptTask(escrowId, contractEventId, { onConfirmed });
		},

		/**
		 * Cancel escrow (version-aware from contract)
		 */
		cancelEscrow: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const escrowId = contract.escrowData.id;
			const contractEventId = contract.contractEvent.id;

			return handler.escrow.cancelEscrow(escrowId, contractEventId);
		},

		/**
		 * Dispute task (version-aware from contract)
		 */
		disputeTask: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			const escrowId = contract.escrowData.id;
			const contractEventId = contract.contractEvent.id;
			const taskId = contract.contractEvent.content?.taskId as string | undefined;

			const result = await handler.escrow.disputeTask(escrowId, contractEventId);
			if (version === 'v2') {
				await updateTaskAtSubmitTime(taskId, TaskStatusEnum.DISPUTED, 'disputeTask', result.hash);
			}
			return result;
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
			const taskId = contract.contractEvent.content?.taskId as string | undefined;

			const result = await handler.escrow.proposeResolution(
				escrowId,
				freelancerAmountRBTC,
				contractEventId,
				proposedClientAmount,
				proposedFreelancerAmount
			);
			if (version === 'v2') {
				await updateTaskAtSubmitTime(
					taskId,
					TaskStatusEnum.DISPUTE_PROPOSAL,
					'proposeResolution',
					result.hash
				);
			}
			return result;
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

			if (version === 'v2') {
				const result = await handler.escrow.acceptProposal(escrowId, contractEventId);
				if (contract.isClient) {
					await updateTaskAtSubmitTime(
						taskId,
						TaskStatusEnum.COMPLETED,
						'acceptProposal',
						result.hash
					);
				}
				return result;
			}

			return handler.escrow.acceptProposal(escrowId, contractEventId, { onConfirmed });
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

			if (version === 'v2') {
				const result = await handler.escrow.resolveAfterTimelock(
					escrowId,
					Number(escrowStatus),
					contractEventId
				);
				if (Number(escrowStatus) === V2EscrowStatus.Completed) {
					await updateTaskAtSubmitTime(
						taskId,
						TaskStatusEnum.COMPLETED,
						'resolveAfterTimelock',
						result.hash
					);
				}
				return result;
			}

			return handler.escrow.resolveAfterTimelock(escrowId, Number(escrowStatus), contractEventId, {
				onConfirmed
			});
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
			const contractEventId = contract.contractEvent.id;

			return handler.escrow.markWorkInProgress(escrowId, contractAddress, contractEventId);
		},

		markNoShow: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			if (!handler.escrow.markNoShow) {
				throw new Error('markNoShow not supported for this contract version');
			}

			const escrowId = contract.escrowData.id;
			const contractAddress = contract.contractEvent.content.contractAddress;
			const contractEventId = contract.contractEvent.id;

			return handler.escrow.markNoShow(escrowId, contractAddress, contractEventId);
		},

		claimNoShowRefund: async (contract: ContractWithEvents): Promise<ContractTransactionResult> => {
			const version = this.getVersionFromContract(contract);
			const handler = this.getHandler(version);

			if (!handler.escrow.claimNoShowRefund) {
				throw new Error('claimNoShowRefund not supported for this contract version');
			}

			const escrowId = contract.escrowData.id;
			const contractAddress = contract.contractEvent.content.contractAddress;
			const contractEventId = contract.contractEvent.id;

			return handler.escrow.claimNoShowRefund(escrowId, contractAddress, contractEventId);
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
			const contractEventId = contract.contractEvent.id;

			return handler.escrow.claimUpfrontDeposit(escrowId, contractAddress, contractEventId);
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
			// Extract version from event tags — missing tag means original V1 contract
			const versionTag = event.tags?.find((tag: string[]) => tag[0] === 'v');
			const version = versionTag?.[1] || 'v1';
			const handler = this.getHandler(version);
			return handler.nostrContract.handleStatusEvent(event);
		},

		/**
		 * Handle incoming contract creation event from Nostr (version extracted from event)
		 */
		handleContractEvent: async (event: NostrEvent): Promise<void> => {
			// Extract version from event tags — missing tag means original V1 contract
			const versionTag = event.tags?.find((tag: string[]) => tag[0] === 'v');
			const version = versionTag?.[1] || 'v1';
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
			escrowId: string;
			contractEventId?: string;
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
	getLatestVersion(): string {
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
	getSupportedVersions(): string[] {
		return Object.keys(VERSION_HANDLERS);
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

// Re-export types
export type {
	IVersionHandler,
	IEscrowHandler,
	IEscrowBidHandler,
	INostrContractHandler
} from './types';

// Re-export utility types from escrowBid for convenience
export type { ValidationWarning, ValidationResult } from './v2/escrowBid';

// Legacy compatibility export.
// Prefer version-specific enums (`v1/escrow.enum`, `v2/escrow.enum`) for behavior,
// and `EscrowStatusValue` for shared cross-version models.
export { EscrowStatus } from './v1/escrow.enum';
export type { EscrowStatusValue } from '$lib/types/escrow-status';

// TODO: Implementation not working as expected, fix later
// Export EscrowStatus as a type derived from the return type of getEscrowStatus
// This makes the type version-aware and dynamic
// export type EscrowStatus = ReturnType<typeof escrow.getEscrowStatus>;
