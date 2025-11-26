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
function mapBlockchainStatusToPermissions(
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
		case EscrowStatus.Funded: // 0 - Escrow funded on blockchain
			// Check if freelancer submitted completion (pending blockchain update)
			const hasTaskCompletedEvent = statusEvents.some(e =>
				e.content.action === EscrowStatus.PendingCompletion && e.content.transactionHash
			);

			if (hasTaskCompletedEvent) {
				console.log('hasTaskCompletedEvent', hasTaskCompletedEvent);
				// Show pending completion state during transaction
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

			// Check if work has started (past estimated start time)
			const hasStarted = now > escrowData.estimatedStartTime;

			console.log('hasStarted', hasStarted);
			return {
				status: hasStarted ? EscrowStatus.InProgress : EscrowStatus.Funded,
				permissions: {
					canComplete: isFreelancer && hasStarted,
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

		case EscrowStatus.Completed: // 4 - Freelancer marked task complete
			const completionTimelockExpired = now > escrowData.timelockExpiry;
			
			// PRIORITY 1: Check if funds were released (FINAL STATE - takes precedence over pending states)
			// This checks blockchain state (via event query in getContracts) or Nostr confirmation
			const hasFundsReleased = statusEvents?.some(e =>
				e.content.action === EscrowStatus.FundsReleased
			);

			if (hasFundsReleased) {
				return {
					status: EscrowStatus.FundsReleased,
					permissions: {
						canComplete: false,
						canAccept: false,
						canDispute: false,
						canPropose: false,
						canAcceptProposal: false,
						canCancel: false,
						canResolveTimelock: false,
						canDelete: false  // ❌ FINAL STATE - cannot delete
					}
				};
			}
			
			// PRIORITY 2: Check for pending acceptance (transaction in progress)
			const hasPendingAcceptance = statusEvents.some(e =>
				e.content.action === EscrowStatus.PendingAcceptance && e.content.transactionHash
			);

			if (hasPendingAcceptance) {
				return {
					status: EscrowStatus.PendingAcceptance,
					permissions: {
						canComplete: false,
						canAccept: false, // Already being accepted
						canDispute: false,
						canPropose: false,
						canAcceptProposal: false,
						canCancel: false,
						canResolveTimelock: false,
						canDelete: false
					}
				};
			}

			// PRIORITY 3: Check for pending dispute (transaction in progress)
			const hasPendingDispute = statusEvents.some(e =>
				e.content.action === EscrowStatus.PendingDispute && e.content.transactionHash
			);

			if (hasPendingDispute) {
				return {
					status: EscrowStatus.PendingDispute,
					permissions: {
						canComplete: false,
						canAccept: false,
						canDispute: false, // Already being disputed
						canPropose: false,
						canAcceptProposal: false,
						canCancel: false,
						canResolveTimelock: false,
						canDelete: false
					}
				};
			}

			// PRIORITY 4: Default completed state (awaiting client action)
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

		case EscrowStatus.InDispute: // 1 - Client disputed the task
			const disputeTimelockExpired = now > escrowData.timelockExpiry;
			
			// Check if there's a proposal (Nostr-only state)
			const hasProposal = !!disputeProposal;
			
			return {
				status: hasProposal ? EscrowStatus.DisputeResolutionProposed : EscrowStatus.InDispute,
				permissions: {
					canComplete: false,
					canAccept: false,
					canDispute: false,
					// Both parties can propose if no proposal exists or if they haven't reached their limit (2 per party)
					canPropose: !hasProposal, // Simplified: only one active proposal at a time
					// Other party can accept if proposal exists
					canAcceptProposal: hasProposal && (
						(isClient && disputeProposal.proposer.toLowerCase() !== escrowData.client.toLowerCase()) ||
						(isFreelancer && disputeProposal.proposer.toLowerCase() !== escrowData.freelancer.toLowerCase())
					),
					canCancel: false,
					canResolveTimelock: isClient && disputeTimelockExpired, // Only client after 14 days
					canDelete: false  // ❌ Cannot delete disputed escrow
				}
			};

		case EscrowStatus.DisputeResolved: // 2 - Dispute resolved (FINAL STATE)
		case EscrowStatus.DisputeUnresolved: // 3 - Dispute unresolved, client refunded (FINAL STATE)
		case EscrowStatus.FundsReleased: // 10 - Task accepted, funds released (FINAL STATE - Nostr-only)
			return {
				status,  // Preserve the specific status
				permissions: {
					canComplete: false,
					canAccept: false,
					canDispute: false,
					canPropose: false,
					canAcceptProposal: false,
					canCancel: false,
					canResolveTimelock: false,
					canDelete: false  // ❌ Cannot delete resolved/completed escrow
				}
			};

		case EscrowStatus.Cancelled: // 5 - Escrow cancelled (FINAL STATE)
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
 * 
 * KEY PRINCIPLE: Nostr events show "pending" states BEFORE blockchain confirms.
 * Once blockchain confirms, we use blockchain state as source of truth.
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
		return mapBlockchainStatusToPermissions(
			blockchainStatus, 
			escrowData, 
			disputeProposal, 
			statusEvents, 
			isClient, 
			isFreelancer
		);
	}

	// CASE 2: Pending funding (transaction hash exists but no blockchain state yet)
	// This happens immediately after createEscrow() is called but before blockchain confirms
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
	// This is a Nostr-only contract that was never funded
	// Check Nostr status events for any pending actions (shouldn't happen, but defensive)
	const latestStatusEvent = statusEvents.length > 0 ? statusEvents[statusEvents.length - 1] : null;
	
	if (latestStatusEvent) {
		const action = latestStatusEvent.content.action;

		// These pending states should only exist if blockchain state exists
		// But we handle them defensively
		if (action === EscrowStatus.PendingCompletion && latestStatusEvent.content.transactionHash) {
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

		if (action === EscrowStatus.PendingDispute && latestStatusEvent.content.transactionHash) {
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

		if (action === EscrowStatus.PendingCancellation && latestStatusEvent.content.transactionHash) {
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

		if (action === EscrowStatus.PendingAcceptance && latestStatusEvent.content.transactionHash) {
			return {
				status: EscrowStatus.PendingAcceptance,
				permissions: {
					canComplete: false,
					canAccept: false,  // Already being accepted
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
	// This is the ONLY case where deletion is allowed
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
