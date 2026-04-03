import type { Event as NostrEvent } from 'nostr-tools';
import type { DisputeProposal, EscrowData } from '$lib/types/wallet';
import type { Attachment } from '$lib/types/task';
import type { EscrowStatus } from '$lib/utils/escrow';

// Contract permissions - grouped for better organization
export interface ContractPermissions {
	canComplete: boolean; // freelancer can mark as complete
	canAccept: boolean; // client can accept completed work
	canDispute: boolean; // client can dispute
	canPropose: boolean; // either party can propose resolution
	canAcceptProposal: boolean; // other party can accept proposal
	canCancel: boolean; // client can cancel within contract rules
	canRefund?: boolean; // taskee can refund the tasker
	canResolveTimelock: boolean; // either party can resolve after timelock
	canDelete: boolean; // ONLY if contract was never funded (no blockchain state, no tx hash)
}

// Main contract event data (content of KINDS.CONTRACT NostrEvent)
export interface NostrContract {
	escrowId: string;
	taskId: string;
	taskTitle: string;
	taskDescription: string;
	freelancerPubkey: string;
	clientPubkey: string;
	amount: string; // RBTC amount
	currency: string; // 'RBTC'
	status: EscrowStatus; // Use enum instead of string
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	type: 'contract'; // Identify as contract message in DMs
	// Transaction hash from escrow creation
	transactionHash?: string;
	contractAddress?: string;
}

// Contract status update event data (content of KINDS.CONTRACT_STATUS NostrEvent)
export interface NostrContractStatus {
	contractEventId: string;
	escrowId: string;
	action: EscrowStatus;
	message?: string;
	timestamp: number;
	type: 'contract-status'; // Identify as contract status message in DMs
	// RSK transaction hash if applicable
	transactionHash?: string;
	// Dispute resolution data
	proposedClientAmount?: string;
	proposedFreelancerAmount?: string;
	// Completion evidence attachments
	completionAttachments?: Attachment[];
}

// NostrEvent with typed content for CONTRACT events
export interface ContractEvent extends NostrEvent {
	content: NostrContract;
	statusEvents?: ContractStatusEvent[]; // Attached by queryNostrEvents
}

// NostrEvent with typed content for CONTRACT_STATUS events
export interface ContractStatusEvent extends NostrEvent {
	content: NostrContractStatus;
}

// Full contract with metadata for UI display
// Components should extract data from events as needed
export interface ContractWithEvents {
	contractEvent: ContractEvent; // Contract NostrEvent (content = NostrContract)
	statusEvents: ContractStatusEvent[]; // Status NostrEvents (content = NostrContractStatus)
	isClient: boolean; // true if current user is the client

	// Blockchain state (source of truth)
	blockchainStatus: EscrowStatus | null; // EscrowStatus enum value from blockchain, null if not funded
	escrowData: EscrowData; // Full escrow data from blockchain
	status: EscrowStatus; // Unified status (includes pending states from Nostr)
	isPending: boolean; // true if blockchain transaction is being processed

	// Permission flags (determined by blockchain state + contract rules)
	permissions: ContractPermissions;

	// Computed data from blockchain/Nostr (avoid duplication in events)
	disputeProposal: DisputeProposal | null; // From blockchain if in dispute
	completionAttachments: Attachment[] | null; // From latest completion status event
}

// Contract creation parameters
export interface CreateContractParams {
	escrowId: string;
	taskId: string;
	taskTitle: string;
	taskDescription: string;
	freelancerPubkey: string;
	amount: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	transactionHash?: string; // Optional transaction hash from escrow creation
}

// Status update parameters
export interface PublishStatusParams {
	contractEventId: string;
	escrowId: string;
	action: EscrowStatus;
	message?: string;
	transactionHash?: string;
	proposedClientAmount?: string;
	proposedFreelancerAmount?: string;
	completionAttachments?: Attachment[];
}

// Contract filter for queries
export interface ContractFilter {
	escrowIds?: string[];
	taskIds?: string[];
	statuses?: EscrowStatus[];
	userPubkey?: string; // filter by client or freelancer
	limit?: number;
	since?: number;
	until?: number;
}

export interface PublishContractStatusParams {
	escrowId: string;
	contractEventId: string;
	transactionHash: string;
	status: EscrowStatus;
	statusMessagingVariant?: 'default' | 'refund';
	completionAttachments?: Attachment[];
	proposedClientAmount?: string;
	proposedFreelancerAmount?: string;
}

export interface ContractCreationEvent {
	escrowId: string;
	contractEventId?: string;
	error?: string;
}

// Pending contract creation requests
export interface PendingContractCreation {
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
