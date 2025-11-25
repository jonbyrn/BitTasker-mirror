import type { NostrContract, ContractStatusEvent, ContractPermissions } from '$lib/types/contract';
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';
import { EscrowStatus } from '$lib/utils/enums/wallet.enum';

/**
 * Helper function to determine if client can cancel based on Solidity contract rules
 * Within 1-hour grace period OR >24 hours before start
 */
function canClientCancel(escrowData: EscrowData, now: number): boolean {
	const oneHour = 3600;
	const twentyFourHours = 86400;
	const timeSinceCreation = now - escrowData.createdAt;
	const timeUntilStart = escrowData.estimatedStartTime - now;

	// Within 1-hour grace period OR >24 hours before start
	return timeSinceCreation < oneHour || timeUntilStart > twentyFourHours;
}

/**
 * Helper function to determine if client can dispute based on Solidity contract rules
 * Within 24h of start time OR after grace period
 */
function canClientDispute(escrowData: EscrowData, now: number): boolean {
	const twentyFourHours = 86400;
	const timeSinceStart = now - escrowData.estimatedStartTime;
	const timeSinceCreation = now - escrowData.createdAt;
	const oneHour = 3600;

	// Within 24h of start time OR after grace period
	return timeSinceStart < twentyFourHours || timeSinceCreation > oneHour;
}

/**
 * Map blockchain EscrowStatus to status + permissions
 * Based on escrow-solidity.md Outcome Map
 * 
 * This implements the EXACT rules from the Solidity contract for each state
 */
function mapFollowUpStatusToEscrow(
	status: EscrowStatus,
	escrowData: EscrowData,
	disputeProposal: DisputeProposal | null,
	statusEvents: ContractStatusEvent[],
	isClient: boolean,
	isFreelancer: boolean
): {
	status: EscrowStatus;
	permissions: ContractPermissions;
} {
	const now = Date.now() / 1000;

	switch (status) {
		case EscrowStatus.Funded: // 0
			// Check if freelancer submitted completion (pending blockchain update)
			const hasTaskCompletedEvent = statusEvents.some(e =>
				e.status.action === 'task-completed' && e.status.transactionHash
			);

			if (hasTaskCompletedEvent) {
				// Show pending completion state during transaction
				return {
					status: EscrowStatus.PendingCompletion,
					permissions: {
						canComplete: false, // Already submitted
						canAccept: false, // Not confirmed yet
						canDispute: false,
						canPropose: false,
						canAcceptProposal: false,
						canCancel: false, // Block during transaction
						canResolveTimelock: false,
						canDelete: false
					}
				};
			}

			// Check if work has started (past estimated start time)
			const hasStarted = now > escrowData.estimatedStartTime;

			return {
				status: hasStarted ? EscrowStatus.InProgress : EscrowStatus.Funded,
				permissions: {
					canComplete: isFreelancer && hasStarted, // Can only complete after start
					canAccept: false,
					canDispute: false,
					canPropose: false,
					canAcceptProposal: false,
					// Client has time restrictions, Freelancer can ALWAYS refund
					canCancel: isClient
						? canClientCancel(escrowData, now)
						: true, // Freelancer can always refund
					canResolveTimelock: false,
					canDelete: false  // ❌ Cannot delete funded escrow
				}
			};

		case EscrowStatus.Completed: // 4
			const completionTimelockExpired = now > escrowData.timelockExpiry;
			return {
				status: EscrowStatus.Completed,
				permissions: {
					canComplete: false,
					canAccept: isClient && !completionTimelockExpired,  // Client can accept before timelock
					canDispute: isClient && canClientDispute(escrowData, now), // Within 24h of start OR after grace
					canPropose: false,
					canAcceptProposal: false,
					canCancel: false,
					canResolveTimelock: completionTimelockExpired, // Either party after 7 days
					canDelete: false  // ❌ Cannot delete completed escrow
				}
			};

		case EscrowStatus.InDispute: // 1
			const disputeTimelockExpired = now > escrowData.timelockExpiry;
			return {
				status: EscrowStatus.InDispute,
				permissions: {
					canComplete: false,
					canAccept: false,
					canDispute: false,
					// Only freelancer can propose, only if no proposal exists
					canPropose: isFreelancer && !disputeProposal,
					// Only client can accept, only if proposal exists
					canAcceptProposal: isClient && !!disputeProposal,
					canCancel: false,
					canResolveTimelock: isClient && disputeTimelockExpired, // Only client after 14 days
					canDelete: false  // ❌ Cannot delete disputed escrow
				}
			};

		case EscrowStatus.DisputeResolved: // 2
		case EscrowStatus.DisputeUnresolved: // 3
			return {
				status: EscrowStatus.DisputeResolved,
				permissions: {
					canComplete: false,
					canAccept: false,
					canDispute: false,
					canPropose: false,
					canAcceptProposal: false,
					canCancel: false,
					canResolveTimelock: false,
					canDelete: false  // ❌ Cannot delete resolved escrow
				}
			};

		case EscrowStatus.Cancelled: // 5
			return {
				status: EscrowStatus.Cancelled,
				permissions: {
					canComplete: false,
					canAccept: false,
					canDispute: false,
					canPropose: false,
					canAcceptProposal: false,
					canCancel: false,
					canResolveTimelock: false,
					canDelete: false  // ❌ Cannot delete cancelled escrow (was funded)
				}
			};

		default:
			// Fallback for unknown status
			return {
				status: EscrowStatus.Funded,
				permissions: {
					canComplete: false,
					canAccept: false,
					canDispute: false,
					canPropose: false,
					canAcceptProposal: false,
					canCancel: false,
					canResolveTimelock: false,
					canDelete: false
				}
			};
	}
}

/**
 * Determine contract status and permissions based on blockchain state + Nostr events
 * 
 * PRIORITY ORDER:
 * 1. Blockchain state (source of truth for funded contracts)
 * 2. Nostr events (for pending states during transaction processing)
 * 3. Contract metadata (for never-funded contracts)
 */
export function determineContractState(
	blockchainStatus: EscrowStatus | null,
	statusEvents: ContractStatusEvent[],
	contract: NostrContract,
	escrowData: EscrowData | null,
	disputeProposal: DisputeProposal | null,
	isPending: boolean,
	isClient: boolean,
	isFreelancer: boolean
): {
	status: EscrowStatus;
	permissions: ContractPermissions;
} {
	// CASE 1: Blockchain state exists (escrow was funded)
	if (blockchainStatus !== null && escrowData) {
		return mapFollowUpStatusToEscrow(blockchainStatus, escrowData, disputeProposal, statusEvents, isClient, isFreelancer);
	}

	// CASE 2: Pending funding (transaction hash exists but no blockchain state yet)
	if (isPending && contract.transactionHash) {
		return {
			status: EscrowStatus.PendingFunding,
			permissions: {
				canComplete: false,
				canAccept: false,
				canDispute: false,
				canPropose: false,
				canAcceptProposal: false,
				canCancel: false,    // Disabled during pending
				canResolveTimelock: false,
				canDelete: false     // Can't delete during funding
			}
		};
	}

	// CASE 3: Never funded (no blockchain state, no transaction hash)
	// Check Nostr status events for any pending actions
	const latestStatusEvent = statusEvents.length > 0 ? statusEvents[statusEvents.length - 1] : null;
	if (latestStatusEvent) {
		const action = latestStatusEvent.status.action;

		// Check for pending actions in Nostr
		if (action === 'task-completed' && latestStatusEvent.status.transactionHash) {
			return {
				status: EscrowStatus.PendingCompletion,
				permissions: {
					canComplete: false,
					canAccept: false,
					canDispute: false,
					canPropose: false,
					canAcceptProposal: false,
					canCancel: false,
					canResolveTimelock: false,
					canDelete: false
				}
			};
		}

		if (action === 'dispute-raised' && latestStatusEvent.status.transactionHash) {
			return {
				status: EscrowStatus.PendingDispute,
				permissions: {
					canComplete: false,
					canAccept: false,
					canDispute: false,
					canPropose: false,
					canAcceptProposal: false,
					canCancel: false,
					canResolveTimelock: false,
					canDelete: false
				}
			};
		}

		if ((action === 'contract-cancelled' || action === 'escrow-cancelled') && latestStatusEvent.status.transactionHash) {
			return {
				status: EscrowStatus.PendingCancellation,
				permissions: {
					canComplete: false,
					canAccept: false,
					canDispute: false,
					canPropose: false,
					canAcceptProposal: false,
					canCancel: false,
					canResolveTimelock: false,
					canDelete: false
				}
			};
		}
	}

	// CASE 4: Never funded, no pending actions - allow deletion
	return {
		status: EscrowStatus.Funded, // Show as funded in UI (contract created but not on blockchain)
		permissions: {
			canComplete: false,
			canAccept: false,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: true  // ✅ Only case where deletion is allowed
		}
	};
}

