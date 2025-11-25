// Escrow status enum
// 0-5: Blockchain states (source of truth from smart contract)
// 6-9: Nostr-specific states (UI states during transaction processing)
export enum EscrowStatus {
	// Blockchain states (0-5)
	Funded = 0,
	InDispute = 1,
	DisputeResolved = 2,
	DisputeUnresolved = 3,
	Completed = 4,
	Cancelled = 5,
	
	// Nostr-specific states (6-9) - pending states during blockchain processing
	InProgress = 6,           // Work started (past estimated start time) but not completed
	PendingFunding = 7,       // Transaction submitted, waiting for blockchain confirmation
	PendingCompletion = 8,    // Complete action submitted, waiting for confirmation
	PendingDispute = 9,       // Dispute action submitted, waiting for confirmation
	PendingCancellation = 10  // Cancel action submitted, waiting for confirmation
}