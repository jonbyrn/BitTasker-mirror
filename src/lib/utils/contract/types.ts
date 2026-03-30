import type { ethers } from 'ethers';

export type ContractChain = 'rsk' | 'bsc';

// Return values from contract call
export type SecurePaymentLegacy = {
	tasker: string;
	taskee: string;
	amount: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	timelockEnd: number;
	createdAt: number;
	taskerFeeTier: number;
	taskeeFeeTier: number;
	state: number;
	noShowMarked: boolean;
};

export enum ContractStatus {
	// ============================================
	// BLOCKCHAIN STATES (0-11) - Source of Truth
	// ============================================
	Funded = 0, // Escrow created and funded on blockchain
	InDispute = 1, // Client disputed the completed task (blockchain state)
	DisputeResolved = 2, // Dispute resolved via proposal acceptance (FINAL)
	DisputeUnresolved = 3, // Dispute timelock expired, client refunded (FINAL)
	Completed = 4, // Taskee marked task complete (blockchain state)
	Cancelled = 5, // Escrow cancelled, funds returned to Tasker (FINAL)
	Refunded = 6, // Escrow refunded, funds returned to Tasker (FINAL)
	FundsReleased = 7, // AFTER acceptTask() confirms - task accepted, funds released (FINAL)
	FundsClaimed = 8, // AFTER claimNoShowRefund() confirms - funds claimed (FINAL)
	NoShow = 9, // Tasker marked freelancer as no-show (FINAL)
	WorkInProgress = 10, // Work actively in progress (blockchain state)
	InDisputeWithTimelock = 11 // In dispute from Work in progress
}

export enum DisplayOnlyStatus {
	InProgress = 11, // Work started (past start time) but not completed yet
	DisputeResolutionProposed = 12 // Proposal exists (Nostr-only, blockchain stays InDispute)
}

export type ContractDisplayStatus = ContractStatus | DisplayOnlyStatus;

export type InitializedContract = {
	contract: ethers.Contract;
	wallet: ethers.Wallet;
	provider: ethers.JsonRpcProvider;
};
