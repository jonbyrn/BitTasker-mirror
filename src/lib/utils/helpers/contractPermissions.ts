import type { NostrContract, ContractStatusEvent, ContractPermissions } from '$lib/types/contract';
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';
import { EscrowStatus } from '$lib/utils/escrow';

/**
 * Helper function to determine if client can cancel based on Solidity contract rules
 * Within 1-hour grace period OR >24 hours before start
 */
function canClientCancel(escrowData: EscrowData, now: number): boolean {
	const oneHour = 3600;
	const twentyFourHours = 86400;

	// Convert timestamps to seconds if they're in milliseconds
	const createdAtSeconds = escrowData.createdAt > 1000000000000
		? escrowData.createdAt / 1000
		: escrowData.createdAt;
	const startTimeSeconds = escrowData.estimatedStartTime > 1000000000000
		? escrowData.estimatedStartTime / 1000
		: escrowData.estimatedStartTime;

	const timeSinceCreation = now - createdAtSeconds;
	const timeUntilStart = startTimeSeconds - now;

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
 * @requires statusEvents to be sorted by timestamp
 */
function mapBlockchainStatusToPermissions(
	status: EscrowStatus,
	escrowData: EscrowData,
	disputeProposal: DisputeProposal | null,
	statusEvents: ContractStatusEvent[],
	contract: NostrContract,
	isClient: boolean,
	isFreelancer: boolean
): {
	status: EscrowStatus;
	permissions: ContractPermissions;
} {
	const now = Date.now() / 1000;

	switch (status) {
		case EscrowStatus.Funded: // 0 - Escrow funded on blockchain
			// PRIORITY 1: Check for pending cancellation (transaction in progress)
			const hasPendingCancellation = statusEvents.some(e =>
				e.content.action === EscrowStatus.PendingCancellation && e.content.transactionHash
			);

			if (hasPendingCancellation) {
				return {
					status: EscrowStatus.PendingCancellation,
					permissions: {
						canComplete: false,
						canAccept: false,
						canDispute: false,
						canPropose: false,
						canAcceptProposal: false,
						canCancel: false, // Already being cancelled
						canResolveTimelock: false,
						canDelete: false
					}
				};
			}

			// PRIORITY 2: Check for pending completion (transaction in progress)
			const hasPendingCompletion = statusEvents.some(e =>
				e.content.action === EscrowStatus.PendingCompletion && e.content.transactionHash
			);

			if (hasPendingCompletion) {
				return {
					status: EscrowStatus.PendingCompletion,
					permissions: {
						canComplete: false, // Already being completed
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

			// PRIORITY 3: Default funded state (work not started or in progress)
			const hasStarted = now > escrowData.estimatedStartTime;

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

			// PRIORITY 2: Check for pending timelock resolution (transaction in progress)
			const hasPendingTimelockResolution = statusEvents.some(e =>
				e.content.action === EscrowStatus.PendingTimelockResolution && e.content.transactionHash
			);

			if (hasPendingTimelockResolution) {
				return {
					status: EscrowStatus.PendingTimelockResolution,
					permissions: {
						canComplete: false,
						canAccept: false,
						canDispute: false,
						canPropose: false,
						canAcceptProposal: false,
						canCancel: false,
						canResolveTimelock: false, // Already being resolved
						canDelete: false
					}
				};
			}

			// PRIORITY 3: Check for pending acceptance (transaction in progress)
			const pendingAcceptanceEvents = statusEvents.filter(e =>
				e.content.action === EscrowStatus.PendingAcceptance && e.content.transactionHash
			);
			const hasPendingAcceptance = pendingAcceptanceEvents.length > 0;

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

			// PRIORITY 4: Check for pending dispute (transaction in progress)
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

			// PRIORITY 5: Default completed state (awaiting client action)
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

			// PRIORITY 1: Check for pending timelock resolution (transaction in progress)
			const hasPendingTimelockResolutionDispute = statusEvents.some(e =>
				e.content.action === EscrowStatus.PendingTimelockResolution && e.content.transactionHash
			);

			if (hasPendingTimelockResolutionDispute) {
				return {
					status: EscrowStatus.PendingTimelockResolution,
					permissions: {
						canComplete: false,
						canAccept: false,
						canDispute: false,
						canPropose: false,
						canAcceptProposal: false,
						canCancel: false,
						canResolveTimelock: false, // Already being resolved
						canDelete: false
					}
				};
			}

			// PRIORITY 2: Check for pending proposal acceptance (transaction in progress)
			const hasPendingProposalAcceptance = statusEvents.some(e =>
				e.content.action === EscrowStatus.PendingProposalAcceptance && e.content.transactionHash
			);

			if (hasPendingProposalAcceptance) {
				return {
					status: EscrowStatus.PendingProposalAcceptance,
					permissions: {
						canComplete: false,
						canAccept: false,
						canDispute: false,
						canPropose: false,
						canAcceptProposal: false, // Already being accepted
						canCancel: false,
						canResolveTimelock: false,
						canDelete: false
					}
				};
			}

			// PRIORITY 3: Check for pending resolution proposal (transaction in progress)
			const hasPendingResolutionProposal = statusEvents.some(e =>
				e.content.action === EscrowStatus.PendingResolutionProposal &&
				e.content.transactionHash &&
				!statusEvents.some(confirmed =>
					confirmed.content.action === EscrowStatus.DisputeResolutionProposed &&
					confirmed.content.transactionHash === e.content.transactionHash
				)
			);

			if (hasPendingResolutionProposal) {
				return {
					status: EscrowStatus.PendingResolutionProposal,
					permissions: {
						canComplete: false,
						canAccept: false,
						canDispute: false,
						canPropose: false, // Already being proposed
						canAcceptProposal: false,
						canCancel: false,
						canResolveTimelock: false,
						canDelete: false
					}
				};
			}

			// PRIORITY 4: Check if there's a confirmed proposal (Nostr-only state)
			const hasProposal = !!disputeProposal;

			// Count proposals per party from Nostr status events
			// Each party can make up to 2 proposals according to the Solidity contract
			const clientProposalCount = statusEvents.filter(e =>
				e.content.action === EscrowStatus.DisputeResolutionProposed &&
				e.pubkey.toLowerCase() === contract.clientPubkey.toLowerCase()
			).length;

			const freelancerProposalCount = statusEvents.filter(e =>
				e.content.action === EscrowStatus.DisputeResolutionProposed &&
				e.pubkey.toLowerCase() === contract.freelancerPubkey.toLowerCase()
			).length;

			const lastProposerNpub = statusEvents.filter(e => e.content.action === EscrowStatus.DisputeResolutionProposed).at(-1)?.pubkey;

			// Current user can propose if:
			// 1. Haven't reached 2-proposal limit AND
			// 2. They weren't the last one to propose
			const canCurrentUserPropose = isClient
				? clientProposalCount < 2 && lastProposerNpub !== contract.clientPubkey.toLowerCase()
				: isFreelancer
					? freelancerProposalCount < 2 && lastProposerNpub !== contract.freelancerPubkey.toLowerCase()
					: false;

			return {
				status: hasProposal ? EscrowStatus.DisputeResolutionProposed : EscrowStatus.InDispute,
				permissions: {
					canComplete: false,
					canAccept: false,
					canDispute: false,
					// Party can propose if they haven't reached their 2-proposal limit
					canPropose: canCurrentUserPropose,
					// Other party can accept if proposal exists and they're not the proposer
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
			contract,
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
