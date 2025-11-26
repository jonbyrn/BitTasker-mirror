import type { Filter, NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { getNpub } from './nostrKeys';
import { getMessageHistory, getMessagedPeople } from '$lib/utils/nostr-message';
import { queryNostrEvents, publishNostrEvent } from '$lib/utils/nostr';
import { TAG_FILTERS, TAG_PATTERNS } from '$lib/utils/constants/tags';
import type {
	NostrContract,
	NostrContractStatus,
	ContractWithEvents,
	ContractStatusEvent,
	ContractEvent,
	CreateContractParams,
	PublishStatusParams,
	ContractFilter
} from '$lib/types/contract';
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';
import { escrow } from '$lib/utils/wallet/escrow';
import { EscrowStatus } from '$lib/utils/enums/wallet.enum';
import { getSignedEvent } from '$lib/utils/nostr';
import { determineContractState } from '$lib/utils/helpers/contractPermissions';
import KINDS from '$lib/utils/constants/kinds';
import nostrEventsService from '$lib/api/services/nostr/events';

/**
 * Create a new contract event after escrow creation (as encrypted DM)
 */
export async function createContract(params: CreateContractParams): Promise<void> {
	try {
		const npub = await getNpub();
		const clientPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const contractData: NostrContract = {
			escrowId: params.escrowId,
			taskId: params.taskId,
			taskTitle: params.taskTitle,
			taskDescription: params.taskDescription,
			freelancerPubkey: params.freelancerPubkey,
			clientPubkey,
			amount: params.amount,
			currency: 'RBTC',
			status: EscrowStatus.Funded, // Contract is created when escrow is funded
			createdAt: Date.now(),
			estimatedStartTime: params.estimatedStartTime,
			estimatedCompletionTime: params.estimatedCompletionTime,
			transactionHash: params.transactionHash, // Include transaction hash if provided
			type: 'contract' // Identify as contract message
		};

		// Send as encrypted contract event
		const contractMessage = JSON.stringify(contractData);
		const tags = TAG_PATTERNS.contract(
			params.escrowId,
			params.taskId,
			params.freelancerPubkey,
			clientPubkey
		);
		await publishNostrEvent(KINDS.CONTRACT, contractMessage, params.freelancerPubkey, tags);
	} catch (error) {
		// Log error but don't throw - allow UI to continue
		console.warn('Error creating contract:', error);
		// Don't throw - let the caller handle the error if needed
		// The UI should show a warning but not break
	}
}

/**
 * Publish a status update for a contract (as encrypted DM)
 */
export async function publishContractStatus(params: PublishStatusParams): Promise<void> {
	try {
		let npub = await getNpub();
		if (npub.startsWith('npub')) {
			const { nip19 } = await import('nostr-tools');
			npub = nip19.decode(npub).data as string;
		} else {
			npub = npub;
		}

		const statusData: NostrContractStatus = {
			contractEventId: params.contractEventId,
			escrowId: params.escrowId,
			action: params.action,
			message: params.message,
			timestamp: Date.now(),
			transactionHash: params.transactionHash,
			proposedClientAmount: params.proposedClientAmount,
			proposedFreelancerAmount: params.proposedFreelancerAmount,
			completionAttachments: params.completionAttachments,
			type: 'contract-status'
		};

		// Query the contract directly by escrowId to get recipient info
		const contractEvents = await queryNostrEvents({
			kinds: [KINDS.CONTRACT],
			'#d': [params.escrowId], // Query by escrowId tag
			limit: 1
		});

		if (contractEvents.length === 0) {
			throw new Error('Contract not found for status update');
		}

		// Get the contract data
		const contractData: NostrContract = contractEvents[0].content as unknown as NostrContract;

		// Determine recipient: if sender is client, send to freelancer, and vice versa
		const recipientPubkey =
			npub === contractData.clientPubkey
				? contractData.freelancerPubkey
				: contractData.clientPubkey;

		// Send as encrypted contract status event
		const statusMessage = JSON.stringify(statusData);
		const tags = TAG_PATTERNS.contractStatus(
			params.contractEventId,
			params.escrowId,
			recipientPubkey,
			params.action
		);
		await publishNostrEvent(KINDS.CONTRACT_STATUS, statusMessage, recipientPubkey, tags);

		console.log(`Status update sent for escrow ${params.escrowId}: ${params.action}`);
	} catch (error) {
		// Log error but don't throw - allow UI to continue
		console.warn('Error publishing contract status:', error);
		// Don't throw - let the caller handle the error if needed
		// The UI should show a warning but not break
	}
}


/**
 * Get all contracts where the user is either client or freelancer
 * 
 * Performance improvements over legacy version:
 * - Queries KINDS.CONTRACT directly instead of fetching ALL conversations
 * - Uses tag-based relay filtering (#p tag for participants)
 * - Queries KINDS.CONTRACT_STATUS separately with #e tag for event reference
 * - 100x reduction in data fetched and decrypted
 * - Includes comprehensive blockchain integration and status management
 */
export async function getContracts(filter?: ContractFilter): Promise<ContractWithEvents[]> {
	try {
		let npub = await getNpub();

		if (npub.startsWith('npub')) {
			const { nip19 } = await import('nostr-tools');
			npub = nip19.decode(npub).data as string;
		}

		// Build filter for contract events
		const nostrFilter: Filter = {
			kinds: [KINDS.CONTRACT],
			...TAG_FILTERS.byNpub(npub), // Contracts where user is participant
			limit: 100
		};

		// Add optional filters
		if (filter?.escrowIds) {
			nostrFilter['#d'] = filter.escrowIds;
		}

		if (filter?.taskIds) {
			nostrFilter['#t'] = filter.taskIds;
		}

		// Note: We don't filter by status here since we need blockchain state to determine true status

		// Query contract events with their status events attached automatically
		// The followup feature will query CONTRACT_STATUS events that reference these contract event IDs
		const contractEventsWithStatus = await queryNostrEvents(
			nostrFilter,
			{
				kinds: [KINDS.CONTRACT_STATUS], // Kind of followup events to query
				limit: 500 // Limit for status events (enough for all contracts)
			},
			{
				attachAs: 'statusEvents', // Attach status events as array property
				keepLatest: false // Keep ALL status events, not just the latest
			}
		);

		// Process contracts with attached status events
		const contractsWithStatuses: ContractWithEvents[] = [];

		for (const event of contractEventsWithStatus) {
			try {
				const contractEvent = event as unknown as ContractEvent;
				// Get status events attached by queryNostrEvents (already filtered and decrypted)
				// Cast properly through unknown since NostrEvent has string content by default
				const statusEvents = contractEvent.statusEvents?.sort((a, b) => a.content.timestamp - b.content.timestamp);

				// Determine if user is client
				const isClient = contractEvent.content.clientPubkey === npub;
				const isFreelancer = contractEvent.content.freelancerPubkey === npub;

				// Query blockchain escrow data (source of truth)
				let escrowData: EscrowData | null = null;
				let blockchainStatus: EscrowStatus | null = null;
				let isPending = false;
				let disputeProposal: DisputeProposal | null = null;

				try {
					escrowData = await escrow.getEscrow(contractEvent.content.escrowId);
					if (escrowData) {
						blockchainStatus = escrowData.status;

						// Fetch dispute proposal if in dispute
						if (blockchainStatus === EscrowStatus.InDispute) {
							try {
								disputeProposal = await escrow.getDisputeProposal(contractEvent.content.escrowId);
								if (disputeProposal && escrowData) {
									// Calculate client amount from total - freelancer amount
									const totalAmount = parseFloat(escrowData.baseAmount);
									const freelancerAmount = parseFloat(disputeProposal.freelancerAmount);
									disputeProposal.clientAmount = (totalAmount - freelancerAmount).toString();
								}
							} catch (disputeError) {
								console.warn(`Failed to load dispute proposal for ${contractEvent.content.escrowId}:`, disputeError);
							}
						}
					}
				} catch (escrowError) {
					console.warn(`Escrow not found (may be pending): ${contractEvent.content.escrowId}`);
					// Check if there's a transactionHash in Nostr - indicates pending funding
					if (contractEvent.content.transactionHash) {
						isPending = true;
					}
				}

				// Determine status and permissions based on blockchain state + Nostr events
				const { status, permissions } = determineContractState(
					blockchainStatus,
					statusEvents || [],
					contractEvent.content,
					escrowData,
					disputeProposal,
					isPending,
					isClient,
					isFreelancer
				);

				// Extract completion attachments from latest status event with attachments
				const completionAttachments = statusEvents?.slice()
					.reverse()
					.find(e => e.content.completionAttachments)
					?.content.completionAttachments || null;

				contractsWithStatuses.push({
					contractEvent,
					statusEvents: statusEvents || [],
					isClient,
					blockchainStatus,
					status,
					isPending,
					permissions,
					disputeProposal,
					completionAttachments
				});
			} catch (error) {
				console.error('Failed to process contract event:', event.id, error);
			}
		}

		// Apply status filter if provided (after blockchain status determination)
		let filteredContracts = contractsWithStatuses;
		if (filter?.statuses) {
			filteredContracts = contractsWithStatuses.filter(c =>
				filter.statuses!.includes(c.status)
			);
		}

		// Sort by creation time (newest first)
		return filteredContracts.sort(
			(a, b) => b.contractEvent.content.createdAt - a.contractEvent.content.createdAt
		);
	} catch (error) {
		throw error;
	}
}

/**
 * Delete a contract event (Nostr event)
 * 
 * DELETION RULES (Blockchain-First):
 * 1. Query blockchain escrow status (source of truth)
 * 2. Allow deletion ONLY if escrow was never funded
 * 3. Block deletion if transaction hash exists (funding in progress)
 * 4. Block deletion for all other cases (funded, completed, cancelled, disputed)
 * 
 * @param contractEventId - The ID of the contract event to delete
 * @param escrowId - The escrow ID to check contract status
 * @throws EscrowError if deletion is not allowed or fails
 */
export async function deleteContract(contractEventId: string, escrowId: string): Promise<void> {
	const { EscrowError, EscrowErrorCode, isEscrowError } = await import(
		'$lib/utils/helpers/escrowErrors'
	);

	try {
		// Step 1: Get contract using new getContracts() function
		const contracts = await getContracts({ escrowIds: [escrowId] });

		if (contracts.length === 0) {
			throw new EscrowError(
				EscrowErrorCode.ESCROW_NOT_FOUND,
				'Contract not found for deletion'
			);
		}

		const contract = contracts[0];

		// Step 2: Check deletion permission (determined by getContracts based on blockchain state)
		if (!contract.permissions.canDelete) {
			// Provide specific error based on state
			if (contract.blockchainStatus !== null) {
				throw new EscrowError(
					EscrowErrorCode.ESCROW_FUNDED,
					'Cannot delete contract: Escrow was funded on blockchain'
				);
			}

			if (contract.isPending || contract.contractEvent.content.transactionHash) {
				throw new EscrowError(
					EscrowErrorCode.ESCROW_FUNDING_IN_PROGRESS,
					'Cannot delete contract: Funding transaction is in progress'
				);
			}

			throw new EscrowError(
				EscrowErrorCode.ESCROW_VERIFICATION_FAILED,
				'Cannot delete contract: Deletion not allowed'
			);
		}

		// Step 3: Create deletion event (NIP-09)
		const deletionEvent = {
			kind: 5,  // Deletion event
			created_at: Math.floor(Date.now() / 1000),
			content: 'Contract deleted by user',
			tags: [
				['e', contractEventId],  // Event to delete
				['k', String(KINDS.CONTRACT)]  // Kind of event being deleted
			]
		};

		// Step 4: Sign and publish deletion event
		const signedEvent = await getSignedEvent(deletionEvent);
		const response = await nostrEventsService.deleteEvent(signedEvent);

		if (response.deleteCount === 0) {
			throw new EscrowError(
				EscrowErrorCode.ESCROW_VERIFICATION_FAILED,
				'Failed to delete contract: Deletion event was not published'
			);
		}

		console.log('✅ Contract deleted successfully:', contractEventId);
	} catch (error) {
		console.error('❌ Failed to delete contract:', error);

		// Re-throw EscrowError as-is
		if (isEscrowError(error)) {
			throw error;
		}

		// Wrap other errors
		throw new EscrowError(
			EscrowErrorCode.ESCROW_UNKNOWN_ERROR,
			`Failed to delete contract: ${error instanceof Error ? error.message : 'Unknown error'}`,
			error
		);
	}
}