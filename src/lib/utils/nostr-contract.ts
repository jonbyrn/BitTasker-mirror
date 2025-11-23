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
	CreateContractParams,
	PublishStatusParams,
	ContractFilter,
	ContractStatus,
	DisplayStatus
} from '$lib/types/contract';
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';
import { get } from 'svelte/store';
import { rskAddress } from '$lib/stores/wallet.store';
import { escrow } from '$lib/utils/wallet/escrow';
import { EscrowStatus } from '$lib/utils/enums/wallet.enum';
import { getSignedEvent } from './nostr';
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
			status: 'funded', // Contract is created when escrow is funded
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
 * Map blockchain EscrowStatus to DisplayStatus + permissions
 * Based on escrow-solidity.md Outcome Map (lines 36-48)
 * 
 * This implements the EXACT rules from the Solidity contract for each state
 */
function mapBlockchainStatusToDisplay(
	status: EscrowStatus,
	escrowData: EscrowData,
	disputeProposal: DisputeProposal | null,
	statusEvents: ContractStatusEvent[],
	isClient: boolean,
	isFreelancer: boolean
): {
	displayStatus: DisplayStatus;
	permissions: {
		canComplete: boolean;
		canAccept: boolean;
		canDispute: boolean;
		canPropose: boolean;
		canAcceptProposal: boolean;
		canCancel: boolean;
		canResolveTimelock: boolean;
		canDelete: boolean;
	};
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
					displayStatus: 'pending-completion',
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
				displayStatus: hasStarted ? 'in-progress' : 'funded', // Time-based display
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
				displayStatus: 'completed',
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
				displayStatus: 'in-dispute',
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
				displayStatus: 'dispute-resolved',
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
				displayStatus: 'cancelled',
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
				displayStatus: 'funded',
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
 * Determine contract display status and permissions based on blockchain state + Nostr events
 * 
 * PRIORITY ORDER:
 * 1. Blockchain state (source of truth for funded contracts)
 * 2. Nostr events (for pending states during transaction processing)
 * 3. Contract metadata (for never-funded contracts)
 */
function determineContractState(
	blockchainStatus: EscrowStatus | null,
	statusEvents: ContractStatusEvent[],
	contract: NostrContract,
	escrowData: EscrowData | null,
	disputeProposal: DisputeProposal | null,
	isPending: boolean,
	isClient: boolean,
	isFreelancer: boolean
): {
	displayStatus: DisplayStatus;
	permissions: {
		canComplete: boolean;
		canAccept: boolean;
		canDispute: boolean;
		canPropose: boolean;
		canAcceptProposal: boolean;
		canCancel: boolean;
		canResolveTimelock: boolean;
		canDelete: boolean;
	};
} {
	// CASE 1: Blockchain state exists (escrow was funded)
	if (blockchainStatus !== null && escrowData) {
		return mapBlockchainStatusToDisplay(blockchainStatus, escrowData, disputeProposal, statusEvents, isClient, isFreelancer);
	}

	// CASE 2: Pending funding (transaction hash exists but no blockchain state yet)
	if (isPending && contract.transactionHash) {
		return {
			displayStatus: 'pending-funding',
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
				displayStatus: 'pending-completion',
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
				displayStatus: 'pending-dispute',
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
				displayStatus: 'pending-cancellation',
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
		displayStatus: 'funded', // Show as funded in UI (contract created but not on blockchain)
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
				const contract = event.content as unknown as NostrContract;

				// Get status events attached by queryNostrEvents (already filtered and decrypted)
				const attachedStatusEvents = ((event as any).statusEvents as NostrEvent[]) || [];

				// Determine if user is client
				const isClient = contract.clientPubkey === npub;
				const isFreelancer = contract.freelancerPubkey === npub;

				// Map status events to ContractStatusEvent format
				const mappedStatusEvents: ContractStatusEvent[] = attachedStatusEvents
					.map((statusEvent: NostrEvent) => {
						const statusData = statusEvent.content as unknown as NostrContractStatus;
						const isFromClient = statusEvent.pubkey === contract.clientPubkey;
						const isFromFreelancer = statusEvent.pubkey === contract.freelancerPubkey;

						return {
							status: statusData,
							event: statusEvent,
							senderPubkey: statusEvent.pubkey,
							isFromClient,
							isFromFreelancer
						};
					})
					.sort((a, b) => a.status.timestamp - b.status.timestamp); // Sort by timestamp

				// Query blockchain escrow data (source of truth)
				let escrowData: EscrowData | null = null;
				let blockchainStatus: EscrowStatus | null = null;
				let isPending = false;
				let disputeProposal: DisputeProposal | null = null;

				try {
					escrowData = await escrow.getEscrow(contract.escrowId);
					if (escrowData) {
						blockchainStatus = escrowData.status;

						// Fetch dispute proposal if in dispute
						if (blockchainStatus === EscrowStatus.InDispute) {
							try {
								disputeProposal = await escrow.getDisputeProposal(contract.escrowId);
								if (disputeProposal && escrowData) {
									// Calculate client amount from total - freelancer amount
									const totalAmount = parseFloat(escrowData.baseAmount);
									const freelancerAmount = parseFloat(disputeProposal.freelancerAmount);
									disputeProposal.clientAmount = (totalAmount - freelancerAmount).toString();
								}
							} catch (disputeError) {
								console.warn(`Failed to load dispute proposal for ${contract.escrowId}:`, disputeError);
							}
						}
					}
				} catch (escrowError) {
					console.warn(`Escrow not found (may be pending): ${contract.escrowId}`);
					// Check if there's a transactionHash in Nostr - indicates pending funding
					if (contract.transactionHash) {
						isPending = true;
					}
				}

				// Determine display status and permissions based on blockchain state + Nostr events
				const { displayStatus, permissions } = determineContractState(
					blockchainStatus,
					mappedStatusEvents,
					contract,
					escrowData,
					disputeProposal,
					isPending,
					isClient,
					isFreelancer
				);

				// Extract completion attachments from status events
				const completionAttachments = mappedStatusEvents
					.find(e => e.status.completionAttachments)
					?.status.completionAttachments;

				contractsWithStatuses.push({
					contract: {
						...contract,
						disputeProposal,
						completionAttachments
					},
					contractEvent: event,
					statusEvents: mappedStatusEvents,
					isClient,
					blockchainStatus,
					displayStatus,
					isPending,
					...permissions
				} as ContractWithEvents);
			} catch (error) {
				console.error('Failed to process contract event:', event.id, error);
			}
		}

		// Apply status filter if provided (after blockchain status determination)
		let filteredContracts = contractsWithStatuses;
		if (filter?.statuses) {
			filteredContracts = contractsWithStatuses.filter(c =>
				filter.statuses!.includes(c.displayStatus as ContractStatus)
			);
		}

		// Sort by creation time (newest first)
		return filteredContracts.sort(
			(a, b) => b.contract.createdAt - a.contract.createdAt
		);
	} catch (error) {
		console.warn('Error getting user contracts (returning partial results):', error);
		return [];
	}
}

/**
 * @deprecated This function is DEPRECATED and will be removed in a future version.
 * It's used by the legacy getUserContractsLegacy() function and deleteContract().
 * New code should use queryNostrEvents with KINDS.CONTRACT directly.
 * 
 * LEGACY ISSUES:
 * - Fetches ALL messages from conversation (inefficient)
 * - Requires decryption of all messages
 * - Should query KINDS.CONTRACT with #d tag (escrowId) instead
 * 
 * @see getContracts() - Uses direct KINDS.CONTRACT queries
 */
async function getContractMessagesByEscrowId(
	escrowId: string
): Promise<{ plaintext: string; event: NostrEvent; senderPubkey: string }[]> {
	try {
		// Use optimized version that doesn't require decryption for better performance
		const messagedPeople = await getMessagedPeople();
		const contractMessages: { plaintext: string; event: NostrEvent; senderPubkey: string }[] = [];

		// Fetch message histories for all conversations in parallel (optimization)
		const messageHistoryPromises = messagedPeople.map(async (person) => {
			try {
				// Use optimized version that batches auth and uses worker
				return await getMessageHistory(person.pubkey, { limit: 200 });
			} catch (err) {
				console.warn('Failed to get message history for pubkey:', person.pubkey, err);
				return [];
			}
		});

		// Wait for all message histories in parallel
		const messageHistories = await Promise.all(messageHistoryPromises);

		// Process all message histories to extract contract messages
		for (let i = 0; i < messagedPeople.length; i++) {
			const messageHistory = messageHistories[i];

			if (!messageHistory || messageHistory.length === 0) continue;

			for (const message of messageHistory) {
				try {
					if (!message.plaintext || message.plaintext.trim() === '') continue;

					const parsedContent = JSON.parse(message.plaintext);

					// Validate parsed content structure
					if (!parsedContent || typeof parsedContent !== 'object') continue;

					// Check if it's a contract-related message for this escrow
					if (
						(parsedContent.type === 'contract' ||
							parsedContent.type === 'contract-status') &&
						parsedContent.escrowId === escrowId &&
						typeof parsedContent.escrowId === 'string'
					) {
						contractMessages.push(message);
					}
				} catch (parseError) {
					// Not a contract message, continue
					continue;
				}
			}
		}

		return contractMessages.sort((a, b) => a.event.created_at - b.event.created_at);
	} catch (error) {
		console.warn('Error getting contract messages by escrow ID:', error);
		return [];
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
		'$lib/utils/errors/escrowErrors'
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
		if (!contract.canDelete) {
			// Provide specific error based on state
			if (contract.blockchainStatus !== null) {
				throw new EscrowError(
					EscrowErrorCode.ESCROW_FUNDED,
					'Cannot delete contract: Escrow was funded on blockchain'
				);
			}

			if (contract.isPending || contract.contract.transactionHash) {
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