import type { ethers } from 'ethers';
import type { CreateContractParams } from '$lib/types/contract';
import { writable } from 'svelte/store';
import type { Attachment } from '$lib/types/task';
import { createContract, sendBidStatusUpdate } from '$lib/utils/nostr-bid';
import { rskWalletStore, getRSKWallet, getEventListeners } from '$lib/stores/rskWallet.store';
import { EscrowStatus } from '$lib/utils/enums/wallet.enum';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { publishContractStatus } from '$lib/utils/nostr-bid';

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
export const escrowCreatedStore = writable<EscrowCreatedEvent | null>(null);
export const contractCreationStore = writable<ContractCreationEvent | null>(null);

// Pending contract creation requests
interface PendingContractCreation {
	escrowId: string;
	taskId: string;
	taskTitle: string;
	bidId: string;
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
	console.log('Registered pending contract for transaction:', params.transactionHash);
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
	// Update the store
	escrowCreatedStore.set(event);

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
		console.log('Found pending contract, creating Nostr contract...');

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

			// Update contract creation store
			contractCreationStore.set({
				escrowId: event.escrowId,
				contractEventId: `contract-${event.escrowId}` // Use escrow ID as reference
			});

			// Publish bid acceptance status via encrypted DM nostr event
			await sendBidStatusUpdate(
				pendingContract.bidId,
				pendingContract.taskId,
				pendingContract.freelancerPubkey,
				'accepted',
				_('dashboard.bids.bid_acceptance.bid_accepted_message'),
				event.escrowId,
				event.transactionHash
			);
			console.log('✅ Bid status update sent successfully after contract creation');


			// Show success toast
			appStore.showSuccessToast(`Contract created successfully! Escrow ID: ${event.escrowId.slice(0, 8)}...`);

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

			// Don't clean up pending contract in case of error - might want to retry
		}
	} else {
		console.log('No pending contract found for escrow:', event.escrowId);
	}
}

/**
 * Handle task completed event - called from transaction confirmation
 */
export async function handleTaskCompleted(event: { 
	escrowId: string; 
	transactionHash: string; 
	contractEventId: string;
	completionAttachments?: Attachment[];
}): Promise<void> {
	console.log('Handling task completed event:', event);

	try {
		// Update escrow status
		updateEscrowStatus(event.escrowId, EscrowStatus.Completed);

		// Update completion cache to confirmed
		const { updateCompletionStatus } = await import('$lib/stores/completionCache.store');
		updateCompletionStatus(event.escrowId, 'confirmed', event.transactionHash);

		// Publish status update to Nostr with completion attachments
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: 'task-completed',
			message: _('dashboard.contracts.actions.task_completed_message'),
			transactionHash: event.transactionHash,
			completionAttachments: event.completionAttachments
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.task_completed_success'));
	} catch (error) {
		console.error('Failed to handle task completed event:', error);
		appStore.showErrorToast(_('dashboard.contracts.actions.task_completed_error'));
	}
}

/**
 * Handle task accepted event - called from transaction confirmation
 */
export async function handleTaskAccepted(event: { escrowId: string; transactionHash: string; contractEventId: string }): Promise<void> {
	console.log('Handling task accepted event:', event);

	try {
		// Update escrow status
		updateEscrowStatus(event.escrowId, EscrowStatus.DisputeResolved);

		// Publish status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: 'payment-released',
			message: _('dashboard.contracts.actions.payment_released_message'),
			transactionHash: event.transactionHash
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.payment_released_success'));

	} catch (error) {
		console.error('Failed to handle task accepted event:', error);
		appStore.showErrorToast(_('dashboard.contracts.actions.payment_released_error'));
	}
}

/**
 * Handle task disputed event - called from transaction confirmation
 */
export async function handleTaskDisputed(event: { escrowId: string; transactionHash: string; contractEventId: string }): Promise<void> {
	console.log('Handling task disputed event:', event);

	try {
		// Update escrow status
		updateEscrowStatus(event.escrowId, EscrowStatus.InDispute);

		// Publish status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: 'dispute-raised',
			message: _('dashboard.contracts.actions.dispute_raised_message'),
			transactionHash: event.transactionHash
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.dispute_raised_success'));

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
		// Update escrow status (should already be InDispute, but ensure it's set)
		updateEscrowStatus(event.escrowId, EscrowStatus.InDispute);

		// Publish status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: 'resolution-proposed',
			message: _('dashboard.contracts.actions.resolution_proposed_message'),
			transactionHash: event.transactionHash,
			proposedClientAmount: event.proposedClientAmount,
			proposedFreelancerAmount: event.proposedFreelancerAmount
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.resolution_proposed_success'));

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
		// Update escrow status
		updateEscrowStatus(event.escrowId, EscrowStatus.DisputeResolved);

		// Publish status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: 'proposal-accepted',
			message: _('dashboard.contracts.actions.proposal_accepted_message'),
			transactionHash: event.transactionHash
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.proposal_accepted_success'));

	} catch (error) {
		console.error('Failed to handle proposal accepted event:', error);
		appStore.showErrorToast(_('dashboard.contracts.actions.proposal_accepted_error'));
	}
}

/**
 * Handle escrow cancelled event - called from transaction confirmation
 */
export async function handleEscrowCancelled(event: { escrowId: string; transactionHash: string; contractEventId: string }): Promise<void> {
	console.log('Handling escrow cancelled event:', event);

	try {
		// Update escrow status
		updateEscrowStatus(event.escrowId, EscrowStatus.Cancelled);

		// Publish status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: 'escrow-cancelled',
			message: _('dashboard.contracts.actions.escrow_cancelled_message'),
			transactionHash: event.transactionHash
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.escrow_cancelled_success'));

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
		// Update escrow status
		updateEscrowStatus(event.escrowId, EscrowStatus.DisputeResolved);

		// Publish status update to Nostr
		await publishContractStatus({
			contractEventId: event.contractEventId,
			escrowId: event.escrowId,
			action: 'timelock-resolved',
			message: _('dashboard.contracts.actions.timelock_resolved_message'),
			transactionHash: event.transactionHash
		});

		// Show success toast
		appStore.showSuccessToast(_('dashboard.contracts.actions.timelock_resolved_success'));

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
	escrowCreatedStore.set(null);
	contractCreationStore.set(null);
}

// Helper function to update escrow status
function updateEscrowStatus(escrowId: string, status: EscrowStatus): void {
	rskWalletStore.update(state => ({
		...state,
		escrows: state.escrows.map(escrow =>
			escrow.id === escrowId
				? { ...escrow, status, lastUpdated: Date.now() }
				: escrow
		)
	}));
}

// Load escrow details from contract (we'll need to import this from escrow.ts)
async function loadEscrowDetails(escrowId: string): Promise<any> {
	// Import the function from escrow.ts to avoid circular dependency
	const { escrow } = await import('$lib/utils/wallet/escrow');
	return await escrow.getEscrow(escrowId);
}

// Load dispute proposal details (we'll need to import this from escrow.ts)
async function loadDisputeProposal(escrowId: string): Promise<any> {
	// Import the function from escrow.ts to avoid circular dependency
	const { escrow } = await import('$lib/utils/wallet/escrow');
	return await escrow.getDisputeProposal(escrowId);
}

/**
 * Set up contract event listeners
 * Note: This is currently disabled on RSK due to eth_getLogs compatibility issues.
 * Event handling is done directly from transaction receipts instead.
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
				rskWalletStore.update(state => ({
					...state,
					escrows: [escrowData, ...state.escrows.filter(e => e.id !== escrowData.id)]
				}));
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
			updateEscrowStatus(escrowIdStr, EscrowStatus.Completed);

			// Handle through event management system
			handleEscrowStatusUpdate(escrowIdStr, 'completed', 'TaskCompleted');
		};

		// Listen for TaskAccepted events
		const taskAcceptedListener = (escrowId: bigint) => {
			const escrowIdStr = escrowId.toString();
			console.log('TaskAccepted event received:', escrowIdStr);
			updateEscrowStatus(escrowIdStr, EscrowStatus.DisputeResolved);

			// Handle through event management system
			handleEscrowStatusUpdate(escrowIdStr, 'resolved', 'TaskAccepted');
		};

		// Listen for TaskDisputed events
		const taskDisputedListener = (escrowId: bigint, disputer: string) => {
			const escrowIdStr = escrowId.toString();
			console.log('TaskDisputed event received:', escrowIdStr, disputer);
			updateEscrowStatus(escrowIdStr, EscrowStatus.InDispute);

			// Handle through event management system
			handleEscrowStatusUpdate(escrowIdStr, 'disputed', 'TaskDisputed');
		};

		// Listen for DisputeProposed events
		const disputeProposedListener = (escrowId: bigint, proposer: string, clientAmount: bigint, freelancerAmount: bigint) => {
			const escrowIdStr = escrowId.toString();
			console.log('DisputeProposed event received:', escrowIdStr);
			loadDisputeProposal(escrowIdStr).then(proposal => {
				if (proposal) {
					rskWalletStore.update(state => ({
						...state,
						disputeProposals: [proposal, ...state.disputeProposals.filter(p => p.escrowId !== proposal.escrowId)]
					}));
				}
			}).catch(console.error);

			// Handle through event management system
			handleEscrowStatusUpdate(escrowIdStr, 'dispute_proposed', 'DisputeProposed');
		};

		// Listen for DisputeResolved events
		const disputeResolvedListener = (escrowId: bigint, clientAmount: bigint, freelancerAmount: bigint) => {
			const escrowIdStr = escrowId.toString();
			console.log('DisputeResolved event received:', escrowIdStr);
			updateEscrowStatus(escrowIdStr, EscrowStatus.DisputeResolved);
			// Remove dispute proposal
			rskWalletStore.update(state => ({
				...state,
				disputeProposals: state.disputeProposals.filter(p => p.escrowId !== escrowIdStr)
			}));

			// Handle through event management system
			handleEscrowStatusUpdate(escrowIdStr, 'resolved', 'DisputeResolved');
		};

		// Listen for EscrowCancelled events
		const escrowCancelledListener = (escrowId: bigint, clientAmount: bigint, freelancerAmount: bigint) => {
			const escrowIdStr = escrowId.toString();
			console.log('EscrowCancelled event received:', escrowIdStr);
			updateEscrowStatus(escrowIdStr, EscrowStatus.Cancelled);

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
