/**
 * Escrow Status Enum - V2
 *
 * BLOCKCHAIN STATES (0-11): Source of truth from Rootstock smart contract V2
 * BUFFER ZONE (12-19): Reserved for future blockchain expansion
 * NOSTR STATES (20+): UI/UX states for pending transactions and custom statuses
 *
 * Key Changes from V1:
 * - Blockchain states expanded from 0-5 to 0-10
 * - Nostr states shifted from 6+ to 20+ (collision prevention)
 * - New blockchain states: Refunded (6), FundsReleased (7), FundsClaimed (8), NoShow (9), WorkInProgress (10)
 * - FundsReleased moved from Nostr-only (V1: 10) to blockchain state (V2: 7)
 * - InProgress removed, replaced by WorkInProgress (10) as blockchain state
 *
 * Flow Examples:
 * 1. Normal completion: Funded (0) → WorkInProgress (10) → Completed (4) → FundsReleased (7) [FINAL]
 * 2. Timelock claim: Funded (0) → WorkInProgress (10) → Completed (4) → FundsClaimed (8) [FINAL]
 * 3. No-show with response: Funded (0) → NoShow (9) → WorkInProgress (10) → Completed (4) → FundsReleased (7)
 * 4. No-show refund: Funded (0) → NoShow (9) → Refunded (6) [FINAL]
 * 5. Cancellation: Funded (0) → Cancelled (5) [FINAL]
 * 6. Dispute: Completed (4) → InDispute (1) → DisputeResolved (2) [FINAL]
 * 7. Dispute from WIP: WorkInProgress (10) → InDisputeWIP (11) → resolve or accept proposal
 */
export enum EscrowStatus {
	// ============================================
	// BLOCKCHAIN STATES (0-11) - Source of Truth
	// ============================================

	Funded = 0, // Escrow created and funded on blockchain
	InDispute = 1, // Client disputed the completed task
	DisputeResolved = 2, // Dispute resolved via proposal acceptance (FINAL)
	DisputeUnresolved = 3, // Dispute timelock expired, client refunded (FINAL)
	Completed = 4, // Freelancer marked task complete
	Cancelled = 5, // Escrow cancelled, funds returned to client (FINAL)
	Refunded = 6, // ⭐ NEW - Funds refunded to client (e.g., no-show) (FINAL)
	FundsReleased = 7, // ⭐ NEW - Client accepted, funds released to freelancer (FINAL) [Was Nostr-only in V1!]
	FundsClaimed = 8, // ⭐ NEW - Freelancer claimed payment after timelock (FINAL)
	NoShow = 9, // ⭐ NEW - Client marked freelancer as no-show
	WorkInProgress = 10, // ⭐ NEW - Work actively in progress (replaces V1 InProgress)
	InDisputeWIP = 11, // ⭐ Dispute opened from WorkInProgress; only tasker can resolveAfterTimelock

	// ============================================
	// BUFFER ZONE (12-19) - Reserved for Future Blockchain States
	// ============================================
	// Intentionally left empty for contract expansion

	// ============================================
	// NOSTR STATES (100+) - Pending & Application States
	// ============================================

	// Application-Only States (no blockchain equivalent)
	DisputeResolutionProposed = 112 // Proposal exists (Nostr-only, blockchain stays InDispute)
}

/**
 * Helper function to check if a status is a blockchain state
 */
export function isBlockchainState(status: EscrowStatus): boolean {
	return status >= 0 && status <= 11;
}

/**
 * Helper function to check if a status is a final state
 */
export function isFinalState(status: EscrowStatus): boolean {
	return [
		EscrowStatus.DisputeResolved,
		EscrowStatus.DisputeUnresolved,
		EscrowStatus.Cancelled,
		EscrowStatus.Refunded,
		EscrowStatus.FundsReleased,
		EscrowStatus.FundsClaimed
	].includes(status);
}

/**
 * Map blockchain state numbers to EscrowStatus enum
 * Used when loading escrow data from smart contract
 */
export function mapBlockchainStateToEnum(blockchainState: number): EscrowStatus {
	const mapping: Record<number, EscrowStatus> = {
		0: EscrowStatus.Funded,
		1: EscrowStatus.InDispute,
		2: EscrowStatus.DisputeResolved,
		3: EscrowStatus.DisputeUnresolved,
		4: EscrowStatus.Completed,
		5: EscrowStatus.Cancelled,
		6: EscrowStatus.Refunded,
		7: EscrowStatus.FundsReleased,
		8: EscrowStatus.FundsClaimed,
		9: EscrowStatus.NoShow,
		10: EscrowStatus.WorkInProgress,
		11: EscrowStatus.InDisputeWIP
	};

	return mapping[blockchainState] ?? EscrowStatus.Funded;
}
