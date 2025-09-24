import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { BidMessage, NostrBid } from '$lib/types/bid';
import { nip19 } from 'nostr-tools';
import { getNpub } from './nostrKeys';
import { sendDirectMessage, getMessageHistory, getMessagedPeople } from './nostr-message';
import { SimplePool } from 'nostr-tools/pool';
import type {
	NostrContract,
	NostrContractStatus,
	ContractWithEvents,
	ContractStatusEvent,
	CreateContractParams,
	PublishStatusParams,
	ContractFilter,
	ContractStatus
} from '$lib/types/contract';

/**
 * Get only bids from DMs (excluding normal messages)
 */
export async function getBidsFromDMs(taskId?: string): Promise<BidMessage[]> {
	try {
		// Get all people you've exchanged messages with
		const messagedPeople = await getMessagedPeople();
		const bids: BidMessage[] = [];

		// For each conversation, search only for messages that are bids
		for (const person of messagedPeople) {
			try {
				// Get bid-specific message history with this person (more efficient)
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 100 });

				// Filter only messages that contain bids
				for (const message of messageHistory) {
					try {
						// Skip if message is empty or invalid
						if (!message.plaintext || message.plaintext.trim() === '') {
							continue;
						}

						// Try to parse as JSON first
						let parsedContent;
						try {
							parsedContent = JSON.parse(message.plaintext);
						} catch {
							// Not JSON, skip
							continue;
						}

						// Verify it's a valid bid
						if (parsedContent.messageType === 'bid' && parsedContent.type === 'bid') {
							// If taskId is specified, filter by that task
							if (!taskId || parsedContent.taskId === taskId) {
								bids.push({
									bid: parsedContent,
									senderPubkey: message.senderPubkey,
									event: message.event
								});
							}
						}
					} catch (parseError) {
						// Not a valid bid, continue
						continue;
					}
				}
			} catch (err) {
				continue;
			}
		}
		
		// Sort by timestamp (most recent first)
		return bids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);
	} catch (error) {
		console.error('Error getting bids from DMs:', error);
		throw error;
	}
}

/**
 * Get all bids sent by the current user
 */
export async function getMyBids(): Promise<BidMessage[]> {
	try {
		const npub = await getNpub();
		const pubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Get all people you've exchanged messages with
		const messagedPeople = await getMessagedPeople();
		const bids: BidMessage[] = [];

		// For each conversation, search only for bids sent by the current user
		for (const person of messagedPeople) {
			try {
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 100 });

				for (const message of messageHistory) {
					try {
						// Skip if message is empty or invalid
						if (!message.plaintext || message.plaintext.trim() === '') {
							continue;
						}

						const parsedContent = JSON.parse(message.plaintext);

						// Verify it's a bid sent by the current user
						if (parsedContent.messageType === 'bid' && 
							parsedContent.type === 'bid' && 
							message.senderPubkey === pubkeyHex) {
							
							// Ensure all fields are present
							const completeBid: NostrBid = {
								...parsedContent,
								messageType: 'bid'
							};

							bids.push({
								bid: completeBid,
								senderPubkey: message.senderPubkey,
								event: message.event
							});
						}
					} catch (parseError) {
						continue;
					}
				}
			} catch (err) {
				// Skip this conversation if there's an error
				console.warn('Failed to get message history for pubkey:', person.pubkey, err);
				continue;
			}
		}

		return bids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);
	} catch (error) {
		console.error('Error getting my bids:', error);
		throw error;
	}
}

// ============================================================================
// CONTRACT MANAGEMENT FUNCTIONS
// ============================================================================

const DEFAULT_RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL];

// Initialize pool for contract operations
const pool = new SimplePool();

/**
 * Query events using the pool
 */
async function queryEvents(relayUrl: string, filters: Filter[]): Promise<NostrEvent[]> {
	try {
		const events = await pool.querySync([relayUrl], filters[0]);
		return events || [];
	} catch (error) {
		console.warn(`Failed to query events from ${relayUrl}:`, error);
		return [];
	}
}

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
			status: 'active',
			createdAt: Date.now(),
			estimatedStartTime: params.estimatedStartTime,
			estimatedCompletionTime: params.estimatedCompletionTime,
			transactionHash: params.transactionHash, // Include transaction hash if provided
			messageType: 'contract' // Identify as contract message
		};

		// Send as encrypted DM to freelancer with single-character tags
		const contractMessage = JSON.stringify(contractData);
		await sendDirectMessage(contractMessage, params.freelancerPubkey, undefined, [
			['d', `contract-${params.escrowId}`], // Parameterized replaceable identifier
			['p', params.freelancerPubkey], // Reference to freelancer
			['e', params.escrowId], // e = escrow-id
			['t', params.taskId], // t = task-id  
			['s', 'active'], // Use single char 's' for status
			['c', 'creation'] // c = contract-type
		]);

	} catch (error) {
		console.error('Error creating contract:', error);
		throw error;
	}
}

/**
 * Publish a status update for a contract (as encrypted DM)
 */
export async function publishContractStatus(params: PublishStatusParams): Promise<void> {
	try {
		const npub = await getNpub();
		const senderPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const statusData: NostrContractStatus = {
			contractEventId: params.contractEventId,
			escrowId: params.escrowId,
			action: params.action,
			message: params.message,
			timestamp: Date.now(),
			transactionHash: params.transactionHash,
			proposedClientAmount: params.proposedClientAmount,
			proposedFreelancerAmount: params.proposedFreelancerAmount,
			messageType: 'contract-status'
		};

		// Get the contract to determine who to send the status update to
		const contractEvents = await getContractMessagesByEscrowId(params.escrowId);
		if (contractEvents.length === 0) {
			throw new Error('Contract not found for status update');
		}

		// Get the contract data from the first (creation) message
		const contractData: NostrContract = JSON.parse(contractEvents[0].plaintext);
		
		// Determine recipient: if sender is client, send to freelancer, and vice versa
		const recipientPubkey = senderPubkey === contractData.clientPubkey 
			? contractData.freelancerPubkey 
			: contractData.clientPubkey;

		// Send as encrypted DM with single-character tags
		const statusMessage = JSON.stringify(statusData);
		await sendDirectMessage(statusMessage, recipientPubkey, undefined, [
			['e', params.contractEventId, '', 'root'], // Reference to contract (threading)
			['r', params.escrowId], // r = escrow-id
			['a', params.action] // a = action
		]);

		console.log(`Status update sent for escrow ${params.escrowId}: ${params.action}`);
	} catch (error) {
		console.error('Error publishing contract status:', error);
		throw error;
	}
}

/**
 * Get contracts for the current user (as client or freelancer) from encrypted DMs
 */
export async function getUserContracts(filter?: ContractFilter): Promise<ContractWithEvents[]> {
	try {
		const npub = await getNpub();
		const userPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Get all people you've exchanged messages with
		const messagedPeople = await getMessagedPeople();
		const contracts: ContractWithEvents[] = [];

		// For each conversation, search for contract messages
		for (const person of messagedPeople) {
			try {
				// Get message history with this person
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 200 });

				// Group messages by escrow ID
				const contractMessages = new Map<string, { plaintext: string; event: NostrEvent; senderPubkey: string }[]>();

				for (const message of messageHistory) {
					try {
						if (!message.plaintext || message.plaintext.trim() === '') continue;

						const parsedContent = JSON.parse(message.plaintext);

						// Check if it's a contract-related message
						if (parsedContent.messageType === 'contract' || parsedContent.messageType === 'contract-status') {
							const escrowId = parsedContent.escrowId;
							if (escrowId) {
								if (!contractMessages.has(escrowId)) {
									contractMessages.set(escrowId, []);
								}
								contractMessages.get(escrowId)!.push(message);
							}
						}
					} catch (parseError) {
						// Not a contract message, continue
						continue;
					}
				}

				// Process each contract
				for (const [escrowId, messages] of contractMessages.entries()) {
					try {
						// Find the contract creation message
						const contractCreationMessage = messages.find(msg => {
							try {
								const content = JSON.parse(msg.plaintext);
								return content.messageType === 'contract';
							} catch {
								return false;
							}
						});

						if (!contractCreationMessage) continue;

						const contractData: NostrContract = JSON.parse(contractCreationMessage.plaintext);
						
						// Check if user is involved in this contract
						const isClient = contractData.clientPubkey === userPubkey;
						const isFreelancer = contractData.freelancerPubkey === userPubkey;
						
						if (!isClient && !isFreelancer) continue;

						// Apply additional filters
						if (filter?.escrowIds && !filter.escrowIds.includes(contractData.escrowId)) continue;
						if (filter?.taskIds && !filter.taskIds.includes(contractData.taskId)) continue;
						if (filter?.statuses && !filter.statuses.includes(contractData.status)) continue;

						// Get status events for this contract
						const statusEvents = await getContractStatusEventsFromMessages(escrowId, messages);

						// Determine current status from latest status event
						let currentStatus = contractData.status;
						if (statusEvents.length > 0) {
							const latestStatus = statusEvents[statusEvents.length - 1];
							// Update status based on latest action
							switch (latestStatus.status.action) {
								case 'task-completed':
									currentStatus = 'completed';
									break;
								case 'payment-released':
									currentStatus = 'resolved';
									break;
								case 'dispute-raised':
									currentStatus = 'disputed';
									break;
								case 'contract-cancelled':
									currentStatus = 'cancelled';
									break;
							}
						}

						// Update contract with current status
						const updatedContract = { ...contractData, status: currentStatus };

						// Determine available actions
						const canComplete = isFreelancer && currentStatus === 'active';
						const canAccept = isClient && currentStatus === 'completed';
						const canDispute = isClient && currentStatus === 'completed';
						const canPropose = currentStatus === 'disputed';
						const canAcceptProposal = currentStatus === 'disputed'; // TODO: Check if proposal exists
						const canCancel = currentStatus === 'active';
						const canResolveTimelock = currentStatus === 'disputed'; // TODO: Check timelock

						contracts.push({
							contract: updatedContract,
							contractEvent: contractCreationMessage.event,
							statusEvents,
							isClient,
							canComplete,
							canAccept,
							canDispute,
							canPropose,
							canAcceptProposal,
							canCancel,
							canResolveTimelock
						});
					} catch (error) {
						console.warn('Failed to parse contract messages:', error);
						continue;
					}
				}
			} catch (err) {
				console.warn('Failed to get message history for pubkey:', person.pubkey, err);
				continue;
			}
		}

		// Sort by creation time (newest first)
		return contracts.sort((a, b) => b.contract.createdAt - a.contract.createdAt);
	} catch (error) {
		console.error('Error getting user contracts:', error);
		throw error;
	}
}

/**
 * Get contract messages by escrow ID from DMs
 */
async function getContractMessagesByEscrowId(escrowId: string): Promise<{ plaintext: string; event: NostrEvent; senderPubkey: string }[]> {
	try {
		// Get all people you've exchanged messages with
		const messagedPeople = await getMessagedPeople();
		const contractMessages: { plaintext: string; event: NostrEvent; senderPubkey: string }[] = [];

		// For each conversation, search for contract messages
		for (const person of messagedPeople) {
			try {
				// Get message history with this person
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 200 });

				for (const message of messageHistory) {
					try {
						if (!message.plaintext || message.plaintext.trim() === '') continue;

						const parsedContent = JSON.parse(message.plaintext);

						// Check if it's a contract-related message for this escrow
						if ((parsedContent.messageType === 'contract' || parsedContent.messageType === 'contract-status') 
							&& parsedContent.escrowId === escrowId) {
							contractMessages.push(message);
						}
					} catch (parseError) {
						// Not a contract message, continue
						continue;
					}
				}
			} catch (err) {
				console.warn('Failed to get message history for pubkey:', person.pubkey, err);
				continue;
			}
		}

		return contractMessages.sort((a, b) => a.event.created_at - b.event.created_at);
	} catch (error) {
		console.error('Error getting contract messages by escrow ID:', error);
		return [];
	}
}

/**
 * Get status events for a specific contract from messages
 */
async function getContractStatusEventsFromMessages(
	escrowId: string, 
	messages: { plaintext: string; event: NostrEvent; senderPubkey: string }[]
): Promise<ContractStatusEvent[]> {
	try {
		// Find the contract creation message to get client/freelancer info
		const contractCreationMessage = messages.find(msg => {
			try {
				const content = JSON.parse(msg.plaintext);
				return content.messageType === 'contract';
			} catch {
				return false;
			}
		});

		if (!contractCreationMessage) return [];

		const contractData: NostrContract = JSON.parse(contractCreationMessage.plaintext);
		const processedEvents: ContractStatusEvent[] = [];

		// Process status messages
		for (const message of messages) {
			try {
				const parsedContent = JSON.parse(message.plaintext);

				if (parsedContent.messageType === 'contract-status') {
					const statusData: NostrContractStatus = parsedContent;
					const isFromClient = message.senderPubkey === contractData.clientPubkey;
					const isFromFreelancer = message.senderPubkey === contractData.freelancerPubkey;

					processedEvents.push({
						status: statusData,
						event: message.event,
						senderPubkey: message.senderPubkey,
						isFromClient,
						isFromFreelancer
					});
				}
			} catch (error) {
				console.warn('Failed to parse status message:', error);
				continue;
			}
		}

		// Sort by timestamp (oldest first for timeline)
		return processedEvents.sort((a, b) => a.status.timestamp - b.status.timestamp);
	} catch (error) {
		console.error('Error getting contract status events from messages:', error);
		return [];
	}
}

/**
 * Update contract status (client only) - now handled through status messages
 */
export async function updateContractStatus(
	escrowId: string, 
	status: ContractStatus, 
	latestStatusEventId?: string
): Promise<void> {
	try {
		// In the DM-based system, contract status is updated through status messages
		console.warn('updateContractStatus is deprecated in DM-based contract system. Use publishContractStatus instead.');
		
		// Create a status update message instead
		await publishContractStatus({
			contractEventId: latestStatusEventId || `contract-${escrowId}`,
			escrowId,
			action: status === 'completed' ? 'task-completed' : 
					status === 'resolved' ? 'payment-released' :
					status === 'disputed' ? 'dispute-raised' :
					status === 'cancelled' ? 'contract-cancelled' : 'task-completed',
			message: `Contract status updated to ${status}`
		});
	} catch (error) {
		console.error('Error updating contract status:', error);
		throw error;
	}
}