import type { Event as NostrEvent } from 'nostr-tools';
import type { DisputeProposal } from './wallet';
import type { Attachment } from './task';

// Contract status actions that can be performed
export type ContractAction = 
	| 'task-completed'
	| 'payment-released'
	| 'dispute-raised'
	| 'resolution-proposed'
	| 'proposal-accepted'
	| 'contract-cancelled'
	| 'escrow-cancelled'
	| 'timelock-resolved';

// Contract status in Nostr (mirrors RSK EscrowStatus)
export type ContractStatus = 
	| 'active'
	| 'completed'
	| 'disputed'
	| 'resolved'
	| 'cancelled';

// Main contract event data (now sent as encrypted DM)
export interface NostrContract {
	escrowId: string;
	taskId: string;
	taskTitle: string;
	taskDescription: string;
	freelancerPubkey: string;
	clientPubkey: string;
	amount: string; // RBTC amount
	currency: string; // 'RBTC'
	status: ContractStatus;
	createdAt: number;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	messageType: 'contract'; // Identify as contract message in DMs
	// References to latest status events
	latestStatusEventId?: string;
	latestClientStatusEventId?: string;
	latestFreelancerStatusEventId?: string;
	// Transaction hash from escrow creation
	transactionHash?: string;
	// Dispute proposal
	disputeProposal?: DisputeProposal;
	// Completion evidence attachments (images/videos)
	completionAttachments?: Attachment[];
}

// Status update event data (both parties can publish as encrypted DMs)
export interface NostrContractStatus {
	contractEventId: string;
	escrowId: string;
	action: ContractAction;
	message?: string;
	timestamp: number;
	messageType: 'contract-status'; // Identify as contract status message in DMs
	// RSK transaction hash if applicable
	transactionHash?: string;
	// Dispute resolution data
	proposedClientAmount?: string;
	proposedFreelancerAmount?: string;
	// Completion evidence attachments
	completionAttachments?: Attachment[];
}

// Full contract with events for UI display
export interface ContractWithEvents {
	contract: NostrContract;
	contractEvent: NostrEvent;
	statusEvents: ContractStatusEvent[];
	isClient: boolean; // true if current user is the client
	canComplete: boolean; // freelancer can mark as complete
	canAccept: boolean; // client can accept completed work
	canDispute: boolean; // client can dispute
	canPropose: boolean; // either party can propose resolution
	canAcceptProposal: boolean; // other party can accept proposal
	canCancel: boolean; // either party can cancel
	canResolveTimelock: boolean; // either party can resolve after timelock
}

// Status event with metadata
export interface ContractStatusEvent {
	status: NostrContractStatus;
	event: NostrEvent;
	senderPubkey: string;
	isFromClient: boolean;
	isFromFreelancer: boolean;
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
	action: ContractAction;
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
	statuses?: ContractStatus[];
	userPubkey?: string; // filter by client or freelancer
	limit?: number;
	since?: number;
	until?: number;
}
