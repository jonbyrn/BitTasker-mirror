import type { ethers } from 'ethers';
import type { CreateContractParams, PublishContractStatusParams } from '$lib/types/contract';
import { writable } from 'svelte/store';
import { createContract, publishContractStatus } from '$lib/utils/escrow/v1/nostrContract';
import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
import { getWallet, getEventListeners } from '$lib/stores/wallet.store';
import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { BidStatusEnum } from '../../enums/bid.enum';
import { contractStore } from '$lib/stores/contract.store';
import { escrow } from '$lib/utils/escrow/v1/escrow';
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

export interface ContractCreationEvent {
	escrowId: string;
	contractEventId?: string;
	error?: string;
}

// Stores for escrow events
// TODO: Useless store, needs to be removed
export const contractCreationStore = writable<ContractCreationEvent | null>(null);

// Pending contract creation requests
interface PendingContractCreation {
	bidEventId: string;
	escrowId: string;
	taskId: string;
	taskTitle: string;
	taskDescription: string;
	freelancerPubkey: string;
	amount: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	transactionHash: string;
}

const pendingContracts = new Map<string, PendingContractCreation>();
const pendingContractsByTxHash = new Map<string, PendingContractCreation>();

/**
 * Register a pending contract creation by transaction hash (before we have escrow ID)
 */
export function registerPendingContractByTxHash(params: Omit<PendingContractCreation, 'escrowId'>): void {
	pendingContractsByTxHash.set(params.transactionHash, params as PendingContractCreation);
	console.log('✅ Registered pending contract for transaction:', params.transactionHash);
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
	if (!pendingContract) {
		for (const [txHash, contract] of pendingContractsByTxHash.entries()) {
			if (txHash === event.transactionHash) {
				pendingContract = contract;
				// Move from txHash map to escrow ID map
				pendingContractsByTxHash.delete(txHash);
				pendingContracts.set(event.escrowId, { ...contract, escrowId: event.escrowId });
				break;
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

			await createContract(contractParams);

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
			await sendBidStatusUpdate(
				pendingContract.bidEventId,
				pendingContract.taskId,
				pendingContract.freelancerPubkey,
				BidStatusEnum.ACCEPTED,
				_('dashboard.bids.bid_acceptance.bid_accepted_message'),
				event.escrowId,
				event.transactionHash
			);

			// Show success toast
			appStore.showSuccessToast(`Contract created successfully! Escrow ID: ${event.escrowId.slice(0, 8)}...`);

			// Reload the newly created contract from Nostr to populate the store
			await contractStore.loadContractByEscrowId(event.escrowId);

			// Note: Task acceptance message (locations/congratulations) is now sent from BidAcceptanceForm.svelte
			// after successful acceptBidAndCreateEscrow, not from here. This keeps the flow cleaner and avoids
			// redundant task fetching since we already have task data in the form.

			// Clean up pending contract
			pendingContracts.delete(event.escrowId);

		} catch (error) {
			console.error('Failed to create Nostr contract:', error);

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

/**
 * Handle escrow status updates - called from contract event listeners
 * @unused - this function is not used anywhere but contract event listeners which is also not used
 */
function handleEscrowStatusUpdate(escrowId: string, status: string, eventType: string): void {
	console.log(`Escrow ${escrowId} status updated:`, { status, eventType });

	// Show appropriate toast based on event type
	switch (eventType) {
		case 'TaskCompleted':
			appStore.showInfoToast(`Task completed for escrow ${escrowId.slice(0, 8)}...`);
			break;
		case 'TaskAccepted':
			appStore.showSuccessToast(`Task accepted! Payment released for escrow ${escrowId.slice(0, 8)}...`);
			break;
		case 'TaskDisputed':
			appStore.showErrorToast(`Task disputed for escrow ${escrowId.slice(0, 8)}...`);
			break;
		case 'DisputeProposed':
			appStore.showInfoToast(`Dispute resolution proposed for escrow ${escrowId.slice(0, 8)}...`);
			break;
		case 'DisputeResolved':
			appStore.showSuccessToast(`Dispute resolved for escrow ${escrowId.slice(0, 8)}...`);
			break;
		case 'EscrowCancelled':
			appStore.showInfoToast(`Escrow cancelled: ${escrowId.slice(0, 8)}...`);
			break;
		default:
			console.log('Unknown event type:', eventType);
	}
}

/**
 * Set up contract event listeners
 * Note: This is currently disabled on RSK due to eth_getLogs compatibility issues.
 * Event handling is done directly from transaction receipts instead.
 * @unused - this function is not used anywhere in the codebase
 */
export function setupContractEventListeners(contract: ethers.Contract): void {
	const wallet = getWallet('rsk');
	if (!contract || !wallet) return;

	// Enable EscrowCreated event listener for contract creation feedback
	const userAddress = wallet.address.toLowerCase();

	// Listen for EscrowCreated events - this is essential for getting escrow ID
	const escrowCreatedListener = (escrowId: bigint, client: string, freelancer: string, amount: bigint, event: any) => {
		// Only handle events where user is involved
		if (client.toLowerCase() !== userAddress && freelancer.toLowerCase() !== userAddress) return;

		console.log('EscrowCreated event received:', { escrowId: escrowId.toString(), client, freelancer });

		// Handle escrow created event through our event management system
		handleEscrowCreated({
			escrowId: escrowId.toString(),
			transactionHash: event.transactionHash,
			client,
			freelancer,
			amount: amount.toString()
		});

		// Load and update escrow data
		escrow.getEscrow(escrowId.toString()).then(escrowData => {
			if (escrowData) {
			}
		}).catch(console.error);
	};

	// Set up EscrowCreated event listener
	try {
		contract.on('EscrowCreated', escrowCreatedListener);
		console.log('EscrowCreated event listener set up successfully');
	} catch (error) {
		console.warn('Failed to set up EscrowCreated event listener:', error);
		// Fallback to the current implementation if event listeners fail
		return;
	}

	// Store cleanup function
	const eventListeners = getEventListeners();
	eventListeners.push(() => {
		if (contract) {
			try {
				contract.off('EscrowCreated', escrowCreatedListener);
			} catch (error) {
				console.warn('Error cleaning up EscrowCreated event listener:', error);
			}
		}
	});

	// Enable other essential event listeners for contract management
	try {
		// Listen for TaskCompleted events
		const taskCompletedListener = (escrowId: bigint) => {
			const escrowIdStr = escrowId.toString();
			console.log('TaskCompleted event received:', escrowIdStr);

			// Handle through event management system
			handleEscrowStatusUpdate(escrowIdStr, 'completed', 'TaskCompleted');
		};

		// Listen for TaskAccepted events
		const taskAcceptedListener = (escrowId: bigint) => {
			const escrowIdStr = escrowId.toString();
			console.log('TaskAccepted event received:', escrowIdStr);

			// Handle through event management system
			handleEscrowStatusUpdate(escrowIdStr, 'funds_released', 'TaskAccepted');
		};

		// Listen for TaskDisputed events
		const taskDisputedListener = (escrowId: bigint, disputer: string) => {
			const escrowIdStr = escrowId.toString();
			console.log('TaskDisputed event received:', escrowIdStr, disputer);

			// Handle through event management system
			handleEscrowStatusUpdate(escrowIdStr, 'disputed', 'TaskDisputed');
		};

		// Listen for DisputeProposed events
		const disputeProposedListener = (escrowId: bigint, proposer: string, clientAmount: bigint, freelancerAmount: bigint) => {
			const escrowIdStr = escrowId.toString();
			console.log('DisputeProposed event received:', escrowIdStr);
			escrow.getDisputeProposal(escrowIdStr).then(proposal => {
				if (proposal) {
				}
			}).catch(console.error);

			// Handle through event management system
			handleEscrowStatusUpdate(escrowIdStr, 'dispute_proposed', 'DisputeProposed');
		};

		// Listen for DisputeResolved events
		const disputeResolvedListener = (escrowId: bigint, clientAmount: bigint, freelancerAmount: bigint) => {
			const escrowIdStr = escrowId.toString();
			console.log('DisputeResolved event received:', escrowIdStr);


			// Handle through event management system
			handleEscrowStatusUpdate(escrowIdStr, 'resolved', 'DisputeResolved');
		};

		// Listen for EscrowCancelled events
		const escrowCancelledListener = (escrowId: bigint, clientAmount: bigint, freelancerAmount: bigint) => {
			const escrowIdStr = escrowId.toString();
			console.log('EscrowCancelled event received:', escrowIdStr);

			// Handle through event management system
			handleEscrowStatusUpdate(escrowIdStr, 'cancelled', 'EscrowCancelled');
		};

		// Set up additional event listeners
		contract.on('TaskCompleted', taskCompletedListener);
		contract.on('TaskAccepted', taskAcceptedListener);
		contract.on('TaskDisputed', taskDisputedListener);
		contract.on('DisputeProposed', disputeProposedListener);
		contract.on('DisputeResolved', disputeResolvedListener);
		contract.on('EscrowCancelled', escrowCancelledListener);

		console.log('All contract event listeners set up successfully');

		// Add cleanup for additional event listeners
		eventListeners.push(() => {
			if (contract) {
				try {
					contract.off('TaskCompleted', taskCompletedListener);
					contract.off('TaskAccepted', taskAcceptedListener);
					contract.off('TaskDisputed', taskDisputedListener);
					contract.off('DisputeProposed', disputeProposedListener);
					contract.off('DisputeResolved', disputeResolvedListener);
					contract.off('EscrowCancelled', escrowCancelledListener);
				} catch (error) {
					console.warn('Error cleaning up additional event listeners:', error);
				}
			}
		});

	} catch (error) {
		console.warn('Failed to set up additional event listeners (using fallback approach):', error);
	}
}