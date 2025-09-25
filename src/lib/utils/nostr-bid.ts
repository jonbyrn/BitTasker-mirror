import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { BidMessage, NostrBid } from '$lib/types/bid';
import { nip19 } from 'nostr-tools';
import { getNpub } from './nostrKeys';
import { sendDirectMessage, getMessageHistoryOptimized as getMessageHistory, getMessagedPeopleOptimized as getMessagedPeople } from './nostr-message';
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
 * Enhanced cache utility for bid data with different cache types
 */
interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number;
}

interface ProcessedBidData {
	originalBids: BidMessage[];
	deduplicatedBids: BidMessage[];
	transformedBids: any[];
}

class BidCache {
	private cache = new Map<string, CacheEntry<any>>();

	set<T>(key: string, data: T, ttlMinutes: number = 5): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now(),
			ttl: ttlMinutes * 60 * 1000 // Convert minutes to milliseconds
		});
	}

	get<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		if (Date.now() - entry.timestamp > entry.ttl) {
			this.cache.delete(key);
			return null;
		}

		return entry.data;
	}

	// Cache processed bid data with different processing stages
	setProcessedBidData(key: string, data: ProcessedBidData, ttlMinutes: number = 5): void {
		this.set(`processed-${key}`, data, ttlMinutes);
	}

	getProcessedBidData(key: string): ProcessedBidData | null {
		return this.get<ProcessedBidData>(`processed-${key}`);
	}

	clear(): void {
		this.cache.clear();
	}

	// Clean up expired entries
	cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > entry.ttl) {
				this.cache.delete(key);
			}
		}
	}
}

// Global cache instance
const bidCache = new BidCache();

/**
 * Currency conversion cache for performance optimization
 */
class CurrencyCache {
	private conversions = new Map<string, { sats: number; timestamp: number; ttl: number }>();

	setConversion(usdAmount: number, btcPrice: number, ttlMinutes: number = 10): number {
		const sats = Math.round(usdAmount / btcPrice * 100000000); // Convert to sats
		const key = `${usdAmount}-${btcPrice}`;
		const ttl = ttlMinutes * 60 * 1000;

		this.conversions.set(key, {
			sats,
			timestamp: Date.now(),
			ttl
		});

		return sats;
	}

	getConversion(usdAmount: number, btcPrice: number): number | null {
		const key = `${usdAmount}-${btcPrice}`;
		const conversion = this.conversions.get(key);

		if (!conversion) return null;

		if (Date.now() - conversion.timestamp > conversion.ttl) {
			this.conversions.delete(key);
			return null;
		}

		return conversion.sats;
	}

	// Batch convert multiple amounts at once for better performance
	batchConvert(amounts: number[], btcPrice: number): number[] {
		return amounts.map(amount => {
			const cached = this.getConversion(amount, btcPrice);
			if (cached !== null) {
				return cached;
			}
			return this.setConversion(amount, btcPrice);
		});
	}

	clear(): void {
		this.conversions.clear();
	}
}

// Global currency cache
const currencyCache = new CurrencyCache();

/**
 * Clear bid cache (call this when bids are created, updated, or deleted)
 */
export function clearBidCache(): void {
	bidCache.clear();
	currencyCache.clear();
}

/**
 * Clean up expired cache entries
 */
export function cleanupBidCache(): void {
	bidCache.cleanup();
}

/**
 * Optimized currency conversion with caching
 */
export function cachedSatsFromUsd(usdAmount: number, btcPrice: number): number {
	return currencyCache.getConversion(usdAmount, btcPrice) ?? currencyCache.setConversion(usdAmount, btcPrice);
}

/**
 * Batch convert multiple USD amounts to sats with caching
 */
export function batchSatsFromUsd(amounts: number[], btcPrice: number): number[] {
	return currencyCache.batchConvert(amounts, btcPrice);
}

/**
 * Optimized deduplication using efficient data structures
 */
export function deduplicateBids(bids: BidMessage[]): BidMessage[] {
	if (bids.length === 0) return [];

	// Use Map for efficient deduplication by bidId
	const uniqueByBidId = new Map<string, BidMessage>();

	for (const bid of bids) {
		// Only keep if we haven't seen this bidId before
		if (!uniqueByBidId.has(bid.bid.bidId)) {
			uniqueByBidId.set(bid.bid.bidId, bid);
		}
	}

	return Array.from(uniqueByBidId.values());
}

/**
 * Get bids for a specific task with optimized processing
 */
export async function getBidsForTaskOptimized(taskId: string): Promise<BidMessage[]> {
	const cacheKey = `task-optimized-${taskId}`;

	// Check if we have cached processed data
	const cachedData = bidCache.getProcessedBidData(cacheKey);
	if (cachedData) {
		console.log('Using cached processed bid data');
		return cachedData.transformedBids;
	}

	try {
		// Get raw bids from DMs
		const dmBids = await getBidsFromDMs(taskId);

		// Deduplicate efficiently
		const deduplicatedBids = deduplicateBids(dmBids);

		// Sort by timestamp (most recent first)
		const sortedBids = deduplicatedBids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);

		// Cache the processed data
		bidCache.setProcessedBidData(cacheKey, {
			originalBids: dmBids,
			deduplicatedBids,
			transformedBids: sortedBids
		}, 5);

		return sortedBids;
	} catch (error) {
		console.error('Error getting optimized task bids:', error);
		throw error;
	}
}

/**
 * Get only bids from DMs (excluding normal messages)
 */
export async function getBidsFromDMs(taskId?: string): Promise<BidMessage[]> {
	try {
		const npub = await getNpub();
		const pubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Create cache key based on user's pubkey and taskId
		const cacheKey = `task-bids-${pubkeyHex}-${taskId || 'all'}`;

		// Check cache first
		const cachedBids = bidCache.get<BidMessage[]>(cacheKey);
		if (cachedBids) {
			console.log('Using cached task bid data');
			return cachedBids;
		}

		// Get all people you've exchanged messages with
		const messagedPeople = await getMessagedPeople();
		const bids: BidMessage[] = [];

		// Fetch message histories for all conversations in parallel
		const messageHistoryPromises = messagedPeople.map(async (person) => {
			try {
				return await getMessageHistory(person.pubkey, { limit: 100 });
			} catch (err) {
				// Return empty array for failed conversations
				return [];
			}
		});

		// Wait for all message histories to be fetched in parallel
		const messageHistories = await Promise.all(messageHistoryPromises);

		// Process all message histories to extract bids
		for (let i = 0; i < messagedPeople.length; i++) {
			const person = messagedPeople[i];
			const messageHistory = messageHistories[i];

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
		}

		// Sort by timestamp (most recent first)
		const sortedBids = bids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);

		// Cache the results for 5 minutes
		bidCache.set(cacheKey, sortedBids, 5);

		return sortedBids;
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

		// Create cache key based on user's pubkey
		const cacheKey = `my-bids-${pubkeyHex}`;

		// Check cache first
		const cachedBids = bidCache.get<BidMessage[]>(cacheKey);
		if (cachedBids) {
			console.log('Using cached bid data');
			return cachedBids;
		}

		// Get all people you've exchanged messages with
		const messagedPeople = await getMessagedPeople();
		const bids: BidMessage[] = [];

		// Fetch message histories for all conversations in parallel
		const messageHistoryPromises = messagedPeople.map(async (person) => {
			try {
				return await getMessageHistory(person.pubkey, { limit: 100 });
			} catch (err) {
				// Skip this conversation if there's an error
				console.warn('Failed to get message history for pubkey:', person.pubkey, err);
				return [];
			}
		});

		// Wait for all message histories to be fetched in parallel
		const messageHistories = await Promise.all(messageHistoryPromises);

		// Process all message histories to extract bids
		for (let i = 0; i < messagedPeople.length; i++) {
			const person = messagedPeople[i];
			const messageHistory = messageHistories[i];

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
		}

		const sortedBids = bids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);

		// Cache the results for 5 minutes
		bidCache.set(cacheKey, sortedBids, 5);

		return sortedBids;
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