import type { ethers } from 'ethers';
import type { Attachment } from '$lib/types/task';
import type { CreateContractParams } from '$lib/types/contract';
import { writable } from 'svelte/store';
import { createContract, publishContractStatus } from '$lib/utils/nostr-contract';
import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
import { getRSKWallet, getEventListeners } from '$lib/stores/wallet.store';
import { EscrowStatus } from '$lib/utils/enums/wallet.enum';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { BidStatusEnum } from '../enums/bid.enum';
import { contractStore } from '$lib/stores/contract.store';
import { escrow } from '$lib/utils/wallet/escrow';
import { sendLocationsToTaskee } from '$lib/utils/location/sendLocation';
import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import type { Task } from '$lib/types/task';

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

			console.log('Creating Nostr contract with params:', contractParams);
			await createContract(contractParams);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [pendingContract.freelancerPubkey],
				title: 'New Contract Created',
				body: `New contract created for task ${pendingContract.taskTitle}`,
				type: 'contract_created',
				clickAction: `${import.meta.env.VITE_APP_URL}/dashboard?tab=contracts`,
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

			// Send location details to taskee if task is in-person
			try {
				// Fetch task data to get locations
				const taskEvent = await nostrEventsService.findEventById(pendingContract.taskId);
				if (taskEvent.data) {
					const taskData = JSON.parse(taskEvent.data.content) as Task;
					
					// Only send locations for in-person tasks
					if (taskData.taskType === TaskTypeEnum.IN_PERSON) {
						// Send locations to taskee
						await sendLocationsToTaskee(
							taskData.pickupLocation || null,
							taskData.dropOffLocation || null,
							pendingContract.freelancerPubkey,
							{
								taskId: pendingContract.taskId,
								taskTitle: taskData.title
							}
						);
					}
				}
			} catch (locationError) {
				// Log error but don't fail contract creation if location sending fails
				console.error('Failed to send location details to taskee:', locationError);
			}

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
 * Publish pending completion status BEFORE transaction is broadcast
 * This prevents double-submissions during blockchain confirmation (~30s)
 */
export async function publishPendingCompletion(
	escrowId: string,
	contractEventId: string,
	transactionHash: string,
	completionAttachments?: Attachment[]
): Promise<void> {
	try {
		await publishContractStatus({
			contractEventId,
			escrowId,
			action: EscrowStatus.PendingCompletion,
			message: _('dashboard.contracts.actions.task_completing_message'),
			transactionHash,
			completionAttachments
		});

		contractStore.updateContractStatus(escrowId, EscrowStatus.PendingCompletion);
	} catch (error) {
		console.error('Failed to publish pending completion:', error);
	}
}

/**
 * Handle task completed event - called from transaction confirmation
 * Freelancer marks the task as completed
 */
export async function handleTaskCompleted(event: {
	escrowId: string;
	transactionHash: string;
	contractEventId: string;
	completionAttachments?: Attachment[];
}): Promise<void> {
	console.log('Handling task completed event:', event);

	try {
		// Publish confirmed status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: EscrowStatus.Completed,
			message: _('dashboard.contracts.actions.task_completed_message'),
			transactionHash: event.transactionHash,
			completionAttachments: event.completionAttachments
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.task_completed_success'));

		// Update contract status
		contractStore.updateContractStatus(event.escrowId, EscrowStatus.Completed, EscrowStatus.Completed);
	} catch (error) {
		console.error('Failed to handle task completed event:', error);
		appStore.showErrorToast(_('dashboard.contracts.actions.task_completed_error'));
	}
}

/**
 * Publish pending acceptance status BEFORE transaction is broadcast
 * This prevents double-submissions during blockchain confirmation (~30s)
 */
export async function publishPendingAcceptance(
	escrowId: string,
	contractEventId: string,
	transactionHash: string
): Promise<void> {
	try {
		await publishContractStatus({
			contractEventId,
			escrowId,
			action: EscrowStatus.PendingAcceptance,
			message: _('dashboard.contracts.actions.task_accepting_message'),
			transactionHash
		});

		contractStore.updateContractStatus(escrowId, EscrowStatus.PendingAcceptance);
	} catch (error) {
		console.error('Failed to publish pending acceptance:', error);
	}
}

/**
 * Handle task accepted event - called from transaction confirmation
 * Client accepts the completed task and funds are released to freelancer
 */
export async function handleTaskAccepted(event: { escrowId: string; transactionHash: string; contractEventId: string }): Promise<void> {
	console.log('Handling task accepted event:', event);

	try {

		// Publish confirmed status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: EscrowStatus.FundsReleased,
			message: _('dashboard.contracts.actions.payment_released_message'),
			transactionHash: event.transactionHash
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.payment_released_success'));

		// Update contract status directly (no need to re-fetch)
		contractStore.updateContractStatus(event.escrowId, EscrowStatus.FundsReleased, EscrowStatus.FundsReleased);
	} catch (error) {
		console.error('Failed to handle task accepted event:', error);
		appStore.showErrorToast(_('dashboard.contracts.actions.payment_released_error'));
	}
}

/**
 * Publish pending dispute status BEFORE transaction is broadcast
 * This prevents double-submissions during blockchain confirmation (~30s)
 */
export async function publishPendingDispute(
	escrowId: string,
	contractEventId: string,
	transactionHash: string
): Promise<void> {
	try {
		await publishContractStatus({
			contractEventId,
			escrowId,
			action: EscrowStatus.PendingDispute,
			message: _('dashboard.contracts.actions.dispute_raising_message'),
			transactionHash
		});

		contractStore.updateContractStatus(escrowId, EscrowStatus.PendingDispute);
	} catch (error) {
		console.error('Failed to publish pending dispute:', error);
	}
}

/**
 * Handle task disputed event - called from transaction confirmation
 * Client disputes the completed task
 */
export async function handleTaskDisputed(event: { escrowId: string; transactionHash: string; contractEventId: string }): Promise<void> {
	console.log('Handling task disputed event:', event);

	try {

		// Publish confirmed status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: EscrowStatus.InDispute,
			message: _('dashboard.contracts.actions.dispute_raised_message'),
			transactionHash: event.transactionHash
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.dispute_raised_success'));

		// Update contract status directly (no need to re-fetch)
		contractStore.updateContractStatus(event.escrowId, EscrowStatus.InDispute, EscrowStatus.InDispute);
	} catch (error) {
		console.error('Failed to handle task disputed event:', error);
		appStore.showErrorToast(_('dashboard.contracts.actions.dispute_raised_error'));
	}
}

/**
 * Handle resolution proposed event - called from transaction confirmation
 */
export async function handleResolutionProposed(event: { escrowId: string; transactionHash: string; contractEventId: string; proposedClientAmount: string; proposedFreelancerAmount: string }): Promise<void> {
	console.log('Handling resolution proposed event:', event);

	try {
		// Publish status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: EscrowStatus.DisputeResolutionProposed,
			message: _('dashboard.contracts.actions.resolution_proposed_message'),
			transactionHash: event.transactionHash,
			proposedClientAmount: event.proposedClientAmount,
			proposedFreelancerAmount: event.proposedFreelancerAmount
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.resolution_proposed_success'));

		// Update contract status directly (no need to re-fetch)
		contractStore.updateContractStatus(event.escrowId, EscrowStatus.DisputeResolutionProposed);
	} catch (error) {
		console.error('Failed to handle resolution proposed event:', error);
		appStore.showErrorToast(_('dashboard.contracts.actions.resolution_proposed_error'));
	}
}

/**
 * Handle proposal accepted event - called from transaction confirmation
 */
export async function handleProposalAccepted(event: { escrowId: string; transactionHash: string; contractEventId: string }): Promise<void> {
	console.log('Handling proposal accepted event:', event);

	try {
		// Publish status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: EscrowStatus.DisputeResolved,
			message: _('dashboard.contracts.actions.proposal_accepted_message'),
			transactionHash: event.transactionHash
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.proposal_accepted_success'));

		// Update contract status directly (no need to re-fetch)
		contractStore.updateContractStatus(event.escrowId, EscrowStatus.DisputeResolved, EscrowStatus.DisputeResolved);
	} catch (error) {
		console.error('Failed to handle proposal accepted event:', error);
		appStore.showErrorToast(_('dashboard.contracts.actions.proposal_accepted_error'));
	}
}

/**
 * Publish pending cancellation status BEFORE transaction is broadcast
 * This prevents double-submissions during blockchain confirmation (~30s)
 */
export async function publishPendingCancellation(
	escrowId: string,
	contractEventId: string,
	transactionHash: string
): Promise<void> {
	try {
		await publishContractStatus({
			contractEventId,
			escrowId,
			action: EscrowStatus.PendingCancellation,
			message: _('dashboard.contracts.actions.escrow_cancelling_message'),
			transactionHash
		});

		contractStore.updateContractStatus(escrowId, EscrowStatus.PendingCancellation);
	} catch (error) {
		console.error('Failed to publish pending cancellation:', error);
	}
}

/**
 * Handle escrow cancelled event - called from transaction confirmation
 */
export async function handleEscrowCancelled(event: { escrowId: string; transactionHash: string; contractEventId: string }): Promise<void> {
	console.log('Handling escrow cancelled event:', event);

	try {
		// Publish confirmed status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: EscrowStatus.Cancelled,
			message: _('dashboard.contracts.actions.escrow_cancelled_message'),
			transactionHash: event.transactionHash
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.escrow_cancelled_success'));

		// Update contract status directly (no need to re-fetch)
		contractStore.updateContractStatus(event.escrowId, EscrowStatus.Cancelled, EscrowStatus.Cancelled);
	} catch (error) {
		console.error('Failed to handle escrow cancelled event:', error);
		appStore.showErrorToast(_('dashboard.contracts.actions.escrow_cancelled_error'));
	}
}

/**
 * Handle timelock resolved event - called from transaction confirmation
 */
export async function handleTimelockResolved(event: { escrowId: string; transactionHash: string; contractEventId: string }): Promise<void> {
	console.log('Handling timelock resolved event:', event);

	try {
		// Publish status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: EscrowStatus.DisputeResolved,
			message: _('dashboard.contracts.actions.timelock_resolved_message'),
			transactionHash: event.transactionHash
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.timelock_resolved_success'));

		// Update contract status directly (no need to re-fetch)
		contractStore.updateContractStatus(event.escrowId, EscrowStatus.DisputeResolved, EscrowStatus.DisputeResolved);
	} catch (error) {
		console.error('Failed to handle timelock resolved event:', error);
		appStore.showErrorToast(_('dashboard.contracts.actions.timelock_resolved_error'));
	}
}

/**
 * Handle escrow status updates - called from contract event listeners
 */
export function handleEscrowStatusUpdate(escrowId: string, status: string, eventType: string): void {
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
 * Clear all pending contracts (useful for cleanup)
 */
export function clearPendingContracts(): void {
	pendingContracts.clear();
	pendingContractsByTxHash.clear();
}

/**
 * Get pending contract count (useful for debugging)
 */
export function getPendingContractCount(): number {
	return pendingContracts.size + pendingContractsByTxHash.size;
}

/**
 * Reset stores (useful for cleanup)
 */
export function resetStores(): void {
	contractCreationStore.set(null);
}


// Load escrow details from contract (we'll need to import this from escrow.ts)
async function loadEscrowDetails(escrowId: string): Promise<any> {
	// Import the function from escrow.ts to avoid circular dependency
	return await escrow.getEscrow(escrowId);
}

// Load dispute proposal details (we'll need to import this from escrow.ts)
async function loadDisputeProposal(escrowId: string): Promise<any> {
	// Import the function from escrow.ts to avoid circular dependency
	return await escrow.getDisputeProposal(escrowId);
}

/**
 * Set up contract event listeners
 * Note: This is currently disabled on RSK due to eth_getLogs compatibility issues.
 * Event handling is done directly from transaction receipts instead.
 * @unused - this function is not used anywhere in the codebase
 */
export function setupContractEventListeners(contract: ethers.Contract): void {
	const wallet = getRSKWallet();
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
		loadEscrowDetails(escrowId.toString()).then(escrowData => {
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
			loadDisputeProposal(escrowIdStr).then(proposal => {
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