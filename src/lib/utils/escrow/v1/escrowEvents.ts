import type { ContractCreationEvent, CreateContractParams, PendingContractCreation, PublishContractStatusParams } from '$lib/types/contract';
import { writable } from 'svelte/store';
import { publishContractEvent, publishContractStatus } from './nostrContract';
import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
import { updateTask } from '$lib/nostr/task';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { EscrowStatus } from './escrow.enum';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
import { contractStore } from '$lib/stores/contract.store';
import { getStatusMessages } from '$lib/utils/helpers/contractStatusFormatter';
const _ = get(t);

// Event types for escrow events
export interface EscrowCreatedEvent {
	escrowId: string;
	transactionHash: string;
	client: string;
	freelancer: string;
	amount: string;
}

// Stores for escrow events
// TODO: Useless store, needs to be removed
export const contractCreationStore = writable<ContractCreationEvent | null>(null);

const pendingContracts = new Map<string, PendingContractCreation>();
const pendingContractsByTxHash = new Map<string, PendingContractCreation>();
// Track contracts currently being processed to prevent race conditions
const processingContracts = new Set<string>();

/**
 * Register a pending contract creation by transaction hash (before we have escrow ID)
 */
export function registerPendingContractByTxHash(params: Omit<PendingContractCreation, 'escrowId'>): void {
	pendingContractsByTxHash.set(params.transactionHash, params as PendingContractCreation);
	console.log('✅ Registered pending contract for transaction:', params.transactionHash);
}

/**
 * Clean up pending contract by transaction hash (called when transaction fails)
 * Uses atomic operations to prevent race conditions with handleEscrowCreated
 */
export function cleanupPendingContractByTxHash(transactionHash: string): void {
	// Check if contract is currently being processed
	if (processingContracts.has(transactionHash)) {
		console.log('⚠️ Skipping cleanup - contract is currently being processed:', transactionHash);
		return;
	}

	// Atomic check-and-delete to prevent race conditions
	const removed = pendingContractsByTxHash.delete(transactionHash);
	if (removed) {
		console.log('🧹 Cleaned up pending contract for failed transaction:', transactionHash);
	}
}

/**
 * Register a pending contract creation for when the escrow is created
 */
export function registerPendingContract(params: PendingContractCreation): void {
	pendingContracts.set(params.escrowId, params);
	console.log('Registered pending contract for escrow:', params.escrowId);
}

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
export async function publishEscrowStatus(params: PublishContractStatusParams): Promise<void> {
	try {
		const messages = getStatusMessages(params.status);
		const isPending = params.status >= EscrowStatus.PendingFunding; // Pending states are 6+

		// Publish to Nostr
		await publishContractStatus({
			contractEventId: params.contractEventId,
			escrowId: params.escrowId,
			action: params.status,
			message: _(isPending ? (messages.pendingMessage || messages.confirmedMessage) : messages.confirmedMessage),
			transactionHash: params.transactionHash,
			completionAttachments: params.completionAttachments,
			proposedClientAmount: params.proposedClientAmount,
			proposedFreelancerAmount: params.proposedFreelancerAmount
		});

		// Show appropriate toast
		if (isPending) {
			// Pending states show info toast (if message exists)
			if (messages.pendingMessage) {
				appStore.showInfoToast(get(t)(messages.pendingMessage));
			}
		} else {
			// Confirmed states show success toast
			appStore.showSuccessToast(get(t)(messages.successToast));
		}
	} catch (error) {
		const messages = getStatusMessages(params.status);
		console.error(`Failed to publish status (${params.status}):`, error);
		appStore.showErrorToast(get(t)(messages.errorToast));
	}
}

/**
 * Handle escrow created event - called from contract event listener
 */
export async function handleEscrowCreated(event: EscrowCreatedEvent): Promise<void> {
	// Check if we have a pending contract for this escrow (by escrow ID or transaction hash)
	let pendingContract = pendingContracts.get(event.escrowId);

	// If not found by escrow ID, try to find by transaction hash
	// Use atomic operations to prevent race conditions with cleanupPendingContractByTxHash
	if (!pendingContract) {
		const txHash = event.transactionHash;

		// Atomic check-and-get to prevent race conditions
		// Mark as processing BEFORE getting to prevent cleanup during processing
		if (pendingContractsByTxHash.has(txHash)) {
			processingContracts.add(txHash);

			// Get the contract (it may have been deleted by cleanup, but we're protected by processingContracts)
			const contract = pendingContractsByTxHash.get(txHash);
			if (contract) {
				// Remove from txHash map and add to escrow ID map
				pendingContractsByTxHash.delete(txHash);
				pendingContract = contract;
				pendingContracts.set(event.escrowId, { ...contract, escrowId: event.escrowId });
				// Keep in processingContracts until we finish processing
			} else {
				// Contract was deleted between has() and get() - remove from processing set
				processingContracts.delete(txHash);
			}
		}
	}

	if (pendingContract) {
		try {
			// Create the contract parameters
			const contractParams: CreateContractParams = {
				escrowId: event.escrowId,
				taskId: pendingContract.taskId,
				taskTitle: pendingContract.taskTitle,
				taskDescription: pendingContract.taskDescription,
				freelancerPubkey: pendingContract.freelancerPubkey,
				amount: pendingContract.amount,
				estimatedStartTime: pendingContract.estimatedStartTime,
				estimatedCompletionTime: pendingContract.estimatedCompletionTime,
				transactionHash: event.transactionHash
			};

			await publishContractEvent(contractParams);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [pendingContract.freelancerPubkey],
				title: `New contract created ${pendingContract.taskTitle ? `for task: ${pendingContract.taskTitle}` : ''}`,
				body: `Your bid ${pendingContract.taskTitle ? `on task: ${pendingContract.taskTitle}` : ''} has been accepted by the client`,
				type: 'contract_created',
				clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});

			// Update contract creation store
			contractCreationStore.set({
				escrowId: event.escrowId,
				contractEventId: `contract-${event.escrowId}` // Use escrow ID as reference
			});

			// Publish bid acceptance status via encrypted DM nostr event
			// If this fails, log the error but don't fail the entire contract creation
			// The escrow is already created, so we should continue even if status update fails
			try {
				await sendBidStatusUpdate(
					pendingContract.bidEventId,
					pendingContract.taskId,
					pendingContract.freelancerPubkey,
					BidStatusEnum.ACCEPTED,
					_('dashboard.bids.bid_acceptance.bid_accepted_message'),
					event.escrowId,
					event.transactionHash
				);
			} catch (statusUpdateError) {
				// Log error but don't throw - escrow is already created
				console.error('Failed to send bid status update after escrow creation:', statusUpdateError);
				// Show warning to user that bid status update failed
				appStore.showErrorToast('Escrow created successfully, but failed to update bid status. The bid status may need to be updated manually.');
			}

			// Update task status to BID_ACCEPTED so bidding is closed (Addressable Event: same kind/pubkey/d-tag, latest content)
			try {
				await updateTask(pendingContract.taskId, { status: TaskStatusEnum.BID_ACCEPTED });
			} catch (taskUpdateError) {
				console.error('Failed to update task status to BID_ACCEPTED:', taskUpdateError);
				appStore.showErrorToast(
					'Escrow and bid status updated, but task status could not be updated. Bidding may still appear open.'
				);
			}

			// Note: Success toast is shown in BidAcceptanceForm.svelte success screen
			// No need to show duplicate toast here to avoid double notifications

			// Reload the newly created contract from Nostr to populate the store
			await contractStore.loadContractByEscrowId(event.escrowId);

			// Note: Task acceptance message (locations/congratulations) is now sent from BidAcceptanceForm.svelte
			// after successful acceptBidAndCreateEscrow, not from here. This keeps the flow cleaner and avoids
			// redundant task fetching since we already have task data in the form.

			// Clean up pending contract
			pendingContracts.delete(event.escrowId);
			// Also remove from processing set if it was there
			processingContracts.delete(event.transactionHash);

		} catch (error) {
			console.error('Failed to create Nostr contract:', error);

			// Remove from processing set on error
			processingContracts.delete(event.transactionHash);

			// Update contract creation store with error
			contractCreationStore.set({
				escrowId: event.escrowId,
				error: error instanceof Error ? error.message : 'Unknown error'
			});

			// Show error toast
			appStore.showErrorToast(
				`Failed to create contract: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	} else {
		console.log('No pending contract found for escrow:', event.escrowId);
	}
}