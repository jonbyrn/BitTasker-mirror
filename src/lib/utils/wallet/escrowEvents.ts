import type { ethers } from 'ethers';
import type { CreateContractParams } from '$lib/types/contract';
import { writable } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { createContract } from '$lib/utils/nostr-bid';
import { rskWalletStore, getRSKWallet, getEventListeners } from '$lib/stores/rskWallet.store';
import { EscrowStatus } from '$lib/utils/enums/wallet.enum';

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
			
			// Show success toast
			appStore.showSuccessToast(
				`Contract created successfully! Escrow ID: ${event.escrowId.slice(0, 8)}...`
			);
			
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
			updateEscrowStatus(escrowIdStr, EscrowStatus.Resolved);
			
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
			updateEscrowStatus(escrowIdStr, EscrowStatus.Resolved);
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
