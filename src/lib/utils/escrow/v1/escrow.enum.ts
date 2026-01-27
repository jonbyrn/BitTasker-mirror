/**
 * Escrow Status Enum
 * 
 * BLOCKCHAIN STATES (0-5): Source of truth from Rootstock smart contract
 * NOSTR STATES (6+): UI/UX states for pending transactions and custom statuses
 * 
 * Flow Example:
 * 1. PendingFunding (6) → Funded (0) → InProgress (7) → PendingCompletion (8) → Completed (4)
 * 2. Completed (4) → PendingAcceptance (11) → FundsReleased (10) [FINAL]
 * 3. Completed (4) → PendingDispute (13) → InDispute (1) → DisputeResolutionProposed (12)
 * 4. DisputeResolutionProposed (12) → DisputeResolved (2) [FINAL]
 * 5. InDispute (1) → DisputeUnresolved (3) [FINAL - timelock expired]
 * 6. Funded (0) → PendingCancellation (9) → Cancelled (5) [FINAL]
 */
export enum EscrowStatus {
	// ============================================
	// BLOCKCHAIN STATES (0-5) - Source of Truth
	// ============================================
	Funded = 0,              // Escrow created and funded on blockchain
	InDispute = 1,           // Client disputed the completed task (blockchain state)
	DisputeResolved = 2,     // Dispute resolved via proposal acceptance (FINAL)
	DisputeUnresolved = 3,   // Dispute timelock expired, client refunded (FINAL)
	Completed = 4,           // Freelancer marked task complete (blockchain state)
	Cancelled = 5,           // Escrow cancelled, funds returned to client (FINAL)
	
	// ============================================
	// NOSTR STATES (6+) - Pending & Custom States
	// ============================================
	
	// Pending States (transaction submitted, waiting for blockchain confirmation)
	PendingFunding = 6,      // BEFORE createEscrow() confirms - prevents double-funding
	InProgress = 7,          // Work started (past start time) but not completed yet
	PendingCompletion = 8,   // BEFORE completeTask() confirms - prevents double-completion
	PendingCancellation = 9, // BEFORE cancelEscrow() confirms - prevents double-cancellation
	
	// Final/Custom States (Nostr-only, no blockchain equivalent)
	FundsReleased = 10,      // AFTER acceptTask() confirms - task accepted, funds released (FINAL)
	PendingAcceptance = 11,  // BEFORE acceptTask() confirms - prevents double-acceptance
	
	// Dispute-Related States
	DisputeResolutionProposed = 12, // Proposal exists (Nostr-only, blockchain stays InDispute)
	PendingDispute = 13,            // BEFORE disputeTask() confirms - prevents double-dispute
	PendingResolutionProposal = 14, // BEFORE proposeResolution() confirms - prevents double-proposal
	PendingProposalAcceptance = 15, // BEFORE acceptProposal() confirms - prevents double-acceptance
	PendingTimelockResolution = 16, // BEFORE resolveAfterTimelock() confirms - prevents double-resolution
}