import type { Event as NostrEvent } from 'nostr-tools';
import type { BidMessage, NostrBid, NostrBidStatus } from '$lib/types/bid';
import { nip19 } from 'nostr-tools';
import { getNpub } from './nostrKeys';
import { sendDirectMessage } from './nostr-message';
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
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';
import { get } from 'svelte/store';
import { rskAddress } from '$lib/stores/wallet.store';
import { escrow } from '$lib/utils/wallet/escrow';
import { EscrowStatus } from '$lib/utils/enums/wallet.enum';
import { getSignedEvent } from './nostr';
import nostrEventsService from '$lib/api/services/nostr/events';

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
	transformedBids: BidMessage[];
}

class BidCache {
	private cache = new Map<string, CacheEntry<any>>();
	private readonly MAX_CACHE_SIZE = 100; // Prevent unbounded growth

	set<T>(key: string, data: T, ttlMinutes: number = 5): void {
		// Auto-cleanup expired entries before adding new ones
		this.cleanup();

		// Prevent cache from growing too large
		if (this.cache.size >= this.MAX_CACHE_SIZE) {
			// Remove oldest entries (simple FIFO approach)
			const firstKey = this.cache.keys().next().value;
			if (firstKey) {
				this.cache.delete(firstKey);
			}
		}

		this.cache.set(key, {
			data,
			timestamp: Date.now(),
			ttl: ttlMinutes * 60 * 1000 // Convert minutes to milliseconds
		});
	}

	get<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		// Auto-cleanup expired entries on access
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
		const sats = Math.round((usdAmount / btcPrice) * 100000000); // Convert to sats
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
		return amounts.map((amount) => {
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
	return (
		currencyCache.getConversion(usdAmount, btcPrice) ??
		currencyCache.setConversion(usdAmount, btcPrice)
	);
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
 * Get bid status messages from DMs
 */
async function getBidStatusMessages(taskId?: string): Promise<{ [bidId: string]: NostrBidStatus }> {
	const startTime = Date.now();
	console.log(`[getBidStatusMessages] 🔍 Starting for taskId: ${taskId || 'all'} at ${new Date().toISOString()}`);
	
	try {
		// Get all people you've exchanged messages with using optimized version
		console.log(`[getBidStatusMessages] 📞 Calling getMessagedPeopleOptimized() at ${new Date().toISOString()}`);
		const { getMessagedPeopleOptimized } = await import('./nostr-message');
		const messagedPeople = await getMessagedPeopleOptimized();
		console.log(`[getBidStatusMessages] ✅ getMessagedPeopleOptimized completed, got ${messagedPeople.length} people at ${new Date().toISOString()}`);
		
		const bidStatuses: { [bidId: string]: NostrBidStatus } = {};

		// Fetch message histories for all conversations in parallel using optimized version
		// The optimized version uses a worker for network I/O and batches auth, preventing multiple prompts
		const { getMessageHistoryOptimized } = await import('./nostr-message');
		console.log(`[getBidStatusMessages] 📞 Starting ${messagedPeople.length} parallel getMessageHistoryOptimized() calls at ${new Date().toISOString()}`);
		const messageHistoryPromises = messagedPeople.map(async (person, index) => {
			try {
				console.log(`[getBidStatusMessages] 📞 getMessageHistoryOptimized(${person.pubkey.substring(0, 8)}...) call #${index + 1} at ${new Date().toISOString()}`);
				const result = await getMessageHistoryOptimized(person.pubkey, { limit: 100 });
				console.log(`[getBidStatusMessages] ✅ getMessageHistoryOptimized(${person.pubkey.substring(0, 8)}...) completed, got ${result.length} messages at ${new Date().toISOString()}`);
				return result;
			} catch (err) {
				console.error(`[getBidStatusMessages] ❌ getMessageHistoryOptimized(${person.pubkey.substring(0, 8)}...) failed:`, err);
				return [];
			}
		});

		const messageHistories = await Promise.all(messageHistoryPromises);
		console.log(`[getBidStatusMessages] ✅ All ${messageHistoryPromises.length} getMessageHistoryOptimized() calls completed at ${new Date().toISOString()}`);

		// Process all message histories to extract bid status messages
		for (let i = 0; i < messagedPeople.length; i++) {
			const messageHistory = messageHistories[i];

			for (const message of messageHistory) {
				try {
					if (!message.plaintext || message.plaintext.trim() === '') {
						continue;
					}

					const parsedContent = JSON.parse(message.plaintext);

					// Check if it's a bid status message
					if (parsedContent.messageType === 'bid-status') {
						// If taskId is specified, filter by that task
						if (!taskId || parsedContent.taskId === taskId) {
							// Keep the latest status for each bid
							const existingStatus = bidStatuses[parsedContent.bidId];
							if (!existingStatus || parsedContent.timestamp > existingStatus.timestamp) {
								bidStatuses[parsedContent.bidId] = parsedContent;
							}
						}
					}
				} catch (parseError) {
					continue;
				}
			}
		}

		const duration = Date.now() - startTime;
		console.log(`[getBidStatusMessages] ✅ Completed in ${duration}ms, found ${Object.keys(bidStatuses).length} bid statuses at ${new Date().toISOString()}`);
		return bidStatuses;
	} catch (error) {
		const duration = Date.now() - startTime;
		console.error(`[getBidStatusMessages] ❌ Error after ${duration}ms:`, error);
		return {};
	}
}

/**
 * Get bids for a specific task with optimized processing
 */
export async function getBidsForTaskOptimized(taskId: string): Promise<BidMessage[]> {
	const startTime = Date.now();
	const cacheKey = `task-optimized-${taskId}`;

	console.log(`[getBidsForTaskOptimized] 🔍 Starting for taskId: ${taskId} at ${new Date().toISOString()}`);

	// Check if we have cached processed data
	const cachedData = bidCache.getProcessedBidData(cacheKey);
	if (cachedData) {
		// Only log in development to reduce console noise
		if (import.meta.env.DEV) {
			console.debug('Using cached processed bid data');
		}
		console.log(`[getBidsForTaskOptimized] ✅ Cache hit, returning ${cachedData.transformedBids.length} bids`);
		return cachedData.transformedBids;
	}

	try {
		// Get raw bids from DMs
		console.log(`[getBidsForTaskOptimized] 📞 Calling getBidsFromDMs(${taskId}) at ${new Date().toISOString()}`);
		const dmBids = await getBidsFromDMs(taskId);
		console.log(`[getBidsForTaskOptimized] ✅ getBidsFromDMs completed, got ${dmBids.length} bids at ${new Date().toISOString()}`);

		// Get bid status messages
		console.log(`[getBidsForTaskOptimized] 📞 Calling getBidStatusMessages(${taskId}) at ${new Date().toISOString()}`);
		const bidStatuses = await getBidStatusMessages(taskId);
		console.log(`[getBidsForTaskOptimized] ✅ getBidStatusMessages completed, got ${Object.keys(bidStatuses).length} statuses at ${new Date().toISOString()}`);

		// Deduplicate efficiently
		const deduplicatedBids = deduplicateBids(dmBids);

		// Apply status updates to bids
		const bidsWithStatus = deduplicatedBids.map((bidMessage) => {
			const status = bidStatuses[bidMessage.bid.bidId];
			if (status) {
				// Create updated bid with new status - NostrBid doesn't have a status field,
				// so we add it for consistency with SimplifiedTaskBid
				const updatedBid = {
					...bidMessage.bid,
					bidStatus: status.status === 'accepted' ? 'ACCEPTED' : 'REJECTED'
				} as NostrBid & { bidStatus: string };
				return {
					...bidMessage,
					bid: updatedBid
				};
			}
			return bidMessage;
		});

		// Sort by timestamp (most recent first)
		const sortedBids = bidsWithStatus.sort((a, b) => b.bid.timestamp - a.bid.timestamp);

		// Cache the processed data
		bidCache.setProcessedBidData(
			cacheKey,
			{
			originalBids: dmBids,
			deduplicatedBids,
			transformedBids: sortedBids
			},
			5
		);

		const duration = Date.now() - startTime;
		console.log(`[getBidsForTaskOptimized] ✅ Completed in ${duration}ms, returning ${sortedBids.length} bids at ${new Date().toISOString()}`);
		return sortedBids;
	} catch (error) {
		const duration = Date.now() - startTime;
		// Don't throw - return what we have so the UI doesn't break
		console.error(`[getBidsForTaskOptimized] ❌ Error after ${duration}ms:`, error);
		// Return empty array if we couldn't load any bids
		return [];
	}
}

/**
 * Get only bids from DMs (excluding normal messages)
 */
export async function getBidsFromDMs(taskId?: string): Promise<BidMessage[]> {
	const startTime = Date.now();
	console.log(`[getBidsFromDMs] 🔍 Starting for taskId: ${taskId || 'all'} at ${new Date().toISOString()}`);
	
	try {
		console.log(`[getBidsFromDMs] 📞 Calling getNpub() at ${new Date().toISOString()}`);
		const npub = await getNpub();
		console.log(`[getBidsFromDMs] ✅ getNpub() completed, got npub: ${npub.substring(0, 16)}... at ${new Date().toISOString()}`);
		
		const pubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Create cache key based on user's pubkey and taskId
		const cacheKey = `task-bids-${pubkeyHex}-${taskId || 'all'}`;

		// Check cache first
		const cachedBids = bidCache.get<BidMessage[]>(cacheKey);
		if (cachedBids) {
			// Only log in development to reduce console noise
			if (import.meta.env.DEV) {
				console.debug('Using cached task bid data');
			}
			return cachedBids;
		}

		// Get all people you've exchanged messages with
		// Use optimized version that doesn't require decryption for better performance
		console.log(`[getBidsFromDMs] 📞 Calling getMessagedPeopleOptimized() at ${new Date().toISOString()}`);
		const { getMessagedPeopleOptimized } = await import('./nostr-message');
		const messagedPeople = await getMessagedPeopleOptimized();
		console.log(`[getBidsFromDMs] ✅ getMessagedPeopleOptimized() completed, got ${messagedPeople.length} people at ${new Date().toISOString()}`);
		
		const bids: BidMessage[] = [];

		// Fetch message histories for all conversations in parallel using optimized version
		// The optimized version uses a worker for network I/O and batches auth, preventing multiple prompts
		const { getMessageHistoryOptimized } = await import('./nostr-message');
		console.log(`[getBidsFromDMs] 📞 Starting ${messagedPeople.length} parallel getMessageHistoryOptimized() calls at ${new Date().toISOString()}`);
		const messageHistoryPromises = messagedPeople.map(async (person, index) => {
			try {
				console.log(`[getBidsFromDMs] 📞 getMessageHistoryOptimized(${person.pubkey.substring(0, 8)}...) call #${index + 1} at ${new Date().toISOString()}`);
				const result = await getMessageHistoryOptimized(person.pubkey, { limit: 100 });
				console.log(`[getBidsFromDMs] ✅ getMessageHistoryOptimized(${person.pubkey.substring(0, 8)}...) completed, got ${result.length} messages at ${new Date().toISOString()}`);
				return result;
			} catch (err) {
				console.error(`[getBidsFromDMs] ❌ getMessageHistoryOptimized(${person.pubkey.substring(0, 8)}...) failed:`, err);
				// Return empty array for failed conversations
				return [];
			}
		});

		// Wait for all message histories to be fetched in parallel
		const messageHistories = await Promise.all(messageHistoryPromises);
		console.log(`[getBidsFromDMs] ✅ All ${messageHistoryPromises.length} getMessageHistoryOptimized() calls completed at ${new Date().toISOString()}`);

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

					// Validate parsed content structure
					if (!parsedContent || typeof parsedContent !== 'object') continue;

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

		const duration = Date.now() - startTime;
		console.log(`[getBidsFromDMs] ✅ Completed in ${duration}ms, found ${sortedBids.length} bids at ${new Date().toISOString()}`);
		return sortedBids;
	} catch (error) {
		const duration = Date.now() - startTime;
		// Don't throw - return what we have so the UI doesn't break
		console.error(`[getBidsFromDMs] ❌ Error after ${duration}ms:`, error);
		// Return empty array if we couldn't load any bids
		return [];
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
			// Only log in development to reduce console noise
			if (import.meta.env.DEV) {
				console.debug('Using cached bid data');
			}
			return cachedBids;
		}

		// Get all people you've exchanged messages with
		// Use optimized version that doesn't require decryption for better performance
		const { getMessagedPeopleOptimized } = await import('./nostr-message');
		const messagedPeople = await getMessagedPeopleOptimized();
		const bids: BidMessage[] = [];

		// Fetch message histories for all conversations in parallel using optimized version
		// The optimized version uses a worker for network I/O and batches auth, preventing multiple prompts
		const { getMessageHistoryOptimized } = await import('./nostr-message');
		const messageHistoryPromises = messagedPeople.map(async (person) => {
			try {
				return await getMessageHistoryOptimized(person.pubkey, { limit: 100 });
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

					// Validate parsed content structure
					if (!parsedContent || typeof parsedContent !== 'object') continue;

					// Verify it's a bid sent by the current user
					if (
						parsedContent.messageType === 'bid' &&
						parsedContent.type === 'bid' &&
						message.senderPubkey === pubkeyHex
					) {
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
		// Don't throw - return what we have so the UI doesn't break
		console.warn('Error getting my bids (returning partial results):', error);
		// Return empty array if we couldn't load any bids
		return [];
	}
}

/**
 * Send a bid status update (acceptance or rejection) via encrypted DM
 */
export async function sendBidStatusUpdate(
	bidId: string,
	taskId: string,
	bidderPubkey: string,
	status: 'accepted' | 'rejected',
	message?: string,
	escrowId?: string,
	transactionHash?: string
): Promise<void> {
	try {
		const statusData: NostrBidStatus = {
			messageType: 'bid-status',
			bidId,
			taskId,
			status,
			message,
			timestamp: Date.now(),
			escrowId,
			transactionHash
		};

		// Send as encrypted DM to the bidder with tags for filtering
		const statusMessage = JSON.stringify(statusData);
		await sendDirectMessage(statusMessage, bidderPubkey, undefined, [
			['b', bidId], // b = bid-id for filtering
			['t', taskId], // t = task-id for filtering
			['s', status], // s = status for filtering
			['type', 'bid-status'] // type tag for easy identification
		]);

		// Clear bid cache to ensure fresh data on next load
		clearBidCache();

		console.log(`Bid status update sent for bid ${bidId}: ${status}`);
	} catch (error) {
		// Log error but don't throw - allow UI to continue
		console.warn('Error sending bid status update:', error);
		// Don't throw - let the caller handle the error if needed
		// The UI should show a warning but not break
	}
}

// ============================================================================
// CONTRACT MANAGEMENT FUNCTIONS
// ============================================================================

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
			completionAttachments: params.completionAttachments,
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
		const recipientPubkey =
			senderPubkey === contractData.clientPubkey
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
		// Log error but don't throw - allow UI to continue
		console.warn('Error publishing contract status:', error);
		// Don't throw - let the caller handle the error if needed
		// The UI should show a warning but not break
	}
}

/**
 * Get contracts for the current user (as client or freelancer) from encrypted DMs
 */
export async function getUserContracts(filter?: ContractFilter): Promise<ContractWithEvents[]> {
	// Initialize contracts array at the top level so it's always available
	const contracts: ContractWithEvents[] = [];
	const startTime = Date.now();
	console.log('[getUserContracts] Starting contract loading', { filter, timestamp: startTime });

	try {
		// Use getAuthOnce() to share auth singleton with getMessageHistoryOptimized()
		// This prevents multiple auth prompts when both are called
		console.log('[getUserContracts] Getting auth...');
		const { getAuthOnce } = await import('./nostr-message');
		const { npub } = await getAuthOnce();
		const userPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;
		console.log('[getUserContracts] Auth obtained', { userPubkey: userPubkey.substring(0, 16) + '...' });

		// OPTIMIZATION 1: Use optimized version that doesn't require decryption
		console.log('[getUserContracts] Getting messaged people...');
		const { getMessagedPeopleOptimized } = await import('./nostr-message');
		const messagedPeople = await getMessagedPeopleOptimized();
		console.log('[getUserContracts] Found messaged people', { count: messagedPeople.length });

		// OPTIMIZATION 2 & 3: Parallelize message history fetching and use optimized version
		const { getMessageHistoryOptimized } = await import('./nostr-message');
		console.log('[getUserContracts] Fetching message histories in parallel...');
		const messageHistoryPromises = messagedPeople.map(async (person, index) => {
			try {
				// Use optimized version that batches auth and uses worker
				const history = await getMessageHistoryOptimized(person.pubkey, { limit: 200 });
				console.log(`[getUserContracts] Message history ${index + 1}/${messagedPeople.length} fetched`, {
					pubkey: person.pubkey.substring(0, 16) + '...',
					messageCount: history.length
				});
				return history;
			} catch (err) {
				console.warn(`[getUserContracts] Failed to get message history for pubkey ${index + 1}:`, {
					pubkey: person.pubkey.substring(0, 16) + '...',
					error: err instanceof Error ? err.message : String(err),
					stack: err instanceof Error ? err.stack : undefined
				});
				return [];
			}
		});

		// Wait for all message histories in parallel (instead of sequential loop)
		console.log('[getUserContracts] Waiting for all message histories...');
		const messageHistories = await Promise.all(messageHistoryPromises);
		console.log('[getUserContracts] All message histories fetched', {
			totalMessages: messageHistories.reduce((sum, h) => sum + h.length, 0)
		});

		// Process all conversations with their message histories
		console.log('[getUserContracts] Processing conversations...');
		
		// Phase 1: Collect all contract data from messages (without blockchain calls)
		type ContractProcessingData = {
			escrowId: string;
			messages: { plaintext: string; event: NostrEvent; senderPubkey: string }[];
			contractData: NostrContract;
			contractCreationMessage: { plaintext: string; event: NostrEvent; senderPubkey: string };
			statusEvents: ContractStatusEvent[];
			isClient: boolean;
			isFreelancer: boolean;
			currentStatus: string;
			latestNostrStatus: string;
		};
		
		const contractDataList: ContractProcessingData[] = [];
		let contractCount = 0;
		
		for (let i = 0; i < messagedPeople.length; i++) {
			const person = messagedPeople[i];
			const messageHistory = messageHistories[i];

			// Skip if no messages for this person
			if (!messageHistory || messageHistory.length === 0) continue;

			console.log(`[getUserContracts] Processing conversation ${i + 1}/${messagedPeople.length}`, {
				pubkey: person.pubkey.substring(0, 16) + '...',
				messageCount: messageHistory.length
			});

			// Group messages by escrow ID
			const contractMessages = new Map<
				string,
				{ plaintext: string; event: NostrEvent; senderPubkey: string }[]
			>();

			for (const message of messageHistory) {
				try {
					if (!message.plaintext || message.plaintext.trim() === '') continue;

					const parsedContent = JSON.parse(message.plaintext);

					// Validate parsed content structure
					if (!parsedContent || typeof parsedContent !== 'object') continue;

					// Check if it's a contract-related message
					if (
						parsedContent.messageType === 'contract' ||
						parsedContent.messageType === 'contract-status'
					) {
						const escrowId = parsedContent.escrowId;
						if (escrowId && typeof escrowId === 'string') {
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
				
				for (const [escrowId, messages] of contractMessages.entries()) {
					contractCount++;
					console.log(`[getUserContracts] Processing contract ${contractCount}`, {
						escrowId,
						messageCount: messages.length
					});
					try {
						// Find the contract creation message
						const contractCreationMessage = messages.find((msg) => {
							try {
								const content = JSON.parse(msg.plaintext);
								return content && typeof content === 'object' && content.messageType === 'contract';
							} catch {
								return false;
							}
						});

						if (!contractCreationMessage) {
							console.warn(`[getUserContracts] No contract creation message found for escrow ${escrowId}`);
							continue;
						}
						console.log(`[getUserContracts] Contract creation message found for escrow ${escrowId}`);

						// Validate contract data structure
						let contractData: NostrContract;
						try {
							const parsed = JSON.parse(contractCreationMessage.plaintext);
							if (!parsed || typeof parsed !== 'object' || !parsed.escrowId || !parsed.taskId) {
								continue; // Invalid contract structure
							}
							contractData = parsed as NostrContract;
						} catch {
							continue; // Invalid JSON
						}

						// Check if user is involved in this contract
						const isClient = contractData.clientPubkey === userPubkey;
						const isFreelancer = contractData.freelancerPubkey === userPubkey;

						if (!isClient && !isFreelancer) continue;

						// Apply additional filters
						if (filter?.escrowIds && !filter.escrowIds.includes(contractData.escrowId)) continue;
						if (filter?.taskIds && !filter.taskIds.includes(contractData.taskId)) continue;
						if (filter?.statuses && !filter.statuses.includes(contractData.status)) continue;

						// Get status events for this contract
						let statusEvents: ContractStatusEvent[] = [];
						try {
							statusEvents = await getContractStatusEventsFromMessages(escrowId, messages);
						} catch (statusError) {
							// Silently handle status event parsing errors
							console.warn(`Failed to parse status events for escrow ${escrowId}:`, statusError);
							statusEvents = [];
						}

						// Determine current status from latest status event
						let currentStatus = contractData.status;
						let latestNostrStatus = '';
						if (statusEvents.length > 0) {
							latestNostrStatus = statusEvents[statusEvents.length - 1].status.action;
							// Update status based on latest action
							switch (latestNostrStatus) {
								case 'task-completed':
									currentStatus = 'completed';
									// Update contract with completion attachments if available
									if (statusEvents[statusEvents.length - 1].status.completionAttachments) {
										contractData.completionAttachments =
											statusEvents[statusEvents.length - 1].status.completionAttachments;
									}
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
						
						// Store contract data for batch processing
						contractDataList.push({
							escrowId,
							messages,
							contractData,
							contractCreationMessage,
							statusEvents,
							isClient,
							isFreelancer,
							currentStatus,
							latestNostrStatus
						});
					} catch (error) {
						console.error('[getUserContracts] Failed to parse contract messages', {
							escrowId,
							error: error instanceof Error ? error.message : String(error),
							errorType: error?.constructor?.name,
							stack: error instanceof Error ? error.stack : undefined,
							messageCount: messages.length
						});
						continue;
					}
				}
			}
		
		// Phase 2: Batch all blockchain calls in parallel (after collecting all contracts)
		if (contractDataList.length > 0) {
			console.log(`[getUserContracts] Batching blockchain calls for ${contractDataList.length} contracts...`);
			
			// Safely get user address once
			let userAddress: string | null = null;
			try {
				userAddress = get(rskAddress);
			} catch (storeError) {
				console.warn('Failed to get RSK address from store:', storeError);
				userAddress = null;
			}
			
			// Batch escrow data fetches
			const escrowDataPromises = contractDataList.map(async (data) => {
				try {
					const escrowData = await escrow.getEscrow(data.escrowId);
					return { escrowId: data.escrowId, escrowData, error: null };
				} catch (escrowError) {
					console.warn(`[getUserContracts] Escrow ${data.escrowId} not found or invalid:`, {
						escrowId: data.escrowId,
						error: escrowError instanceof Error ? escrowError.message : String(escrowError)
					});
					return { escrowId: data.escrowId, escrowData: null, error: escrowError };
				}
			});
			
			// Batch funding status checks (only for contracts with escrow data)
			const escrowDataResults = await Promise.all(escrowDataPromises);
			const escrowDataMap = new Map<string, EscrowData | null>();
			for (const result of escrowDataResults) {
				escrowDataMap.set(result.escrowId, result.escrowData);
			}
			
			// Batch funding status checks
			const fundingStatusPromises = contractDataList.map(async (data) => {
				const escrowData = escrowDataMap.get(data.escrowId);
				if (!escrowData || !userAddress) {
					return { escrowId: data.escrowId, fundingStatus: null };
				}
				try {
					const fundingStatus = await escrow.checkEscrowFundingStatus(data.escrowId);
					return { escrowId: data.escrowId, fundingStatus };
				} catch (fundingError) {
					console.warn(`[getUserContracts] Failed to check funding status for escrow ${data.escrowId}:`, {
						escrowId: data.escrowId,
						error: fundingError instanceof Error ? fundingError.message : String(fundingError)
					});
					return { escrowId: data.escrowId, fundingStatus: { wasFunded: false } };
				}
			});
			
			const fundingStatusResults = await Promise.all(fundingStatusPromises);
			const fundingStatusMap = new Map<string, { wasFunded: boolean; escrowData?: EscrowData | null; error?: unknown } | null>();
			for (const result of fundingStatusResults) {
				fundingStatusMap.set(result.escrowId, result.fundingStatus);
			}
			
			// Batch dispute proposal fetches (only for contracts in dispute)
			const disputeProposalPromises = contractDataList
				.filter(data => {
					const escrowData = escrowDataMap.get(data.escrowId);
					return escrowData && escrowData.status === EscrowStatus.InDispute;
				})
				.map(async (data) => {
					try {
						const disputeProposal = await escrow.getDisputeProposal(data.escrowId);
						if (disputeProposal) {
							const escrowData = escrowDataMap.get(data.escrowId);
							if (escrowData) {
								const totalAmount = parseFloat(escrowData.baseAmount);
								const freelancerAmount = parseFloat(disputeProposal.freelancerAmount);
								disputeProposal.clientAmount = (totalAmount - freelancerAmount).toString();
							}
						}
						return { escrowId: data.escrowId, disputeProposal };
					} catch (disputeError) {
						console.warn(`Failed to load dispute proposal for escrow ${data.escrowId}:`, disputeError);
						return { escrowId: data.escrowId, disputeProposal: null };
					}
				});
			
			const disputeProposalResults = await Promise.all(disputeProposalPromises);
			const disputeProposalMap = new Map<string, DisputeProposal | null>();
			for (const result of disputeProposalResults) {
				disputeProposalMap.set(result.escrowId, result.disputeProposal);
			}
			
			console.log(`[getUserContracts] Blockchain calls completed, processing ${contractDataList.length} contracts...`);
			
			// Phase 3: Process all contracts with batched blockchain data
			for (const data of contractDataList) {
				try {
					const escrowData = escrowDataMap.get(data.escrowId) ?? null;
					const fundingStatus = fundingStatusMap.get(data.escrowId) ?? null;
					const disputeProposal = disputeProposalMap.get(data.escrowId) ?? null;
					
					// Determine available actions by checking actual RSK contract state
					let canComplete = false;
					let canAccept = false;
					let canDispute = false;
					let canPropose = false;
					let canAcceptProposal = false;
					let canCancel = false;
					let canResolveTimelock = false;
					let canDelete = false; // Can only delete if never funded or funding failed
					let currentStatus = data.currentStatus;
					const latestNostrStatus = data.latestNostrStatus;

					console.log(
						`Contract ${data.contractData.escrowId}: RSK status = ${escrowData?.status} (${escrowData ? ['Funded', 'InDispute', 'DisputeResolved', 'DisputeUnresolved', 'Completed', 'Cancelled'][escrowData.status] || 'Unknown' : 'No Data'})`
					);

					if (escrowData && userAddress) {
						// Use funding status from batch fetch (already done above)
						// RSK contract state is the source of truth, but Nostr status events provide additional context
						// Use latest Nostr status event to determine if certain actions have been completed
						switch (escrowData.status) {
							case EscrowStatus.Funded: // 0
								// Keep Nostr status if it's more specific, otherwise use 'active'
								if (currentStatus !== 'completed' && currentStatus !== 'disputed') {
									currentStatus = 'active';
								}
								canComplete = data.isFreelancer && latestNostrStatus !== 'task-completed';
								canCancel = true; // Either party can cancel when funded
								canDelete = false; // Cannot delete if funded
								break;

							case EscrowStatus.InDispute: // 1
								currentStatus = 'disputed';

								// Only taskee (freelancer) can propose resolution if no active proposal exists
								canPropose = data.isFreelancer && !disputeProposal;

								// Only tasker (client) can accept proposal if:
								// 1. Proposal exists
								// 2. User is the client (not the proposer who is the freelancer)
								canAcceptProposal = data.isClient && !!disputeProposal;

								// Can resolve after timelock if timelock has expired
								canResolveTimelock = Date.now() > escrowData.timelockExpiry * 1000;
								canDelete = false; // Cannot delete if funded (dispute means it was funded)
								break;

							case EscrowStatus.DisputeResolved: // 2
							case EscrowStatus.DisputeUnresolved: // 3
								currentStatus = 'resolved';
								// TODO: No actions available for resolved disputes
								canDelete = false; // Cannot delete if funded (resolved means it was funded)
								break;

							case EscrowStatus.Completed: // 4
								// Check if payment was already released via Nostr event
								currentStatus = 'completed';
								if (latestNostrStatus !== 'payment-released') {
									// Only allow accept/dispute if payment hasn't been released yet
									canAccept = data.isClient;
									canDispute = data.isClient;
								}
								canDelete = false; // Cannot delete if funded (completed means it was funded)
								break;

							case EscrowStatus.Cancelled: // 5
								currentStatus = 'cancelled';
								// No actions available for cancelled contracts
								// Use blockchain-level validation to check if escrow was ever funded
								// This is more reliable than checking transaction hash
								if (fundingStatus && fundingStatus.wasFunded) {
									canDelete = false; // Escrow was funded, cannot delete
								} else {
									canDelete = true; // Escrow was never funded (funding failed), can delete
								}
								break;
						}

						// Note: canDelete is already set in each switch case above
						// No need to recalculate here to avoid overriding correct values
					} else {
						// Fallback to Nostr status if RSK data unavailable
						console.warn('[getUserContracts] RSK escrow data unavailable, falling back to Nostr status', {
							escrowId: data.contractData.escrowId,
							hasUserAddress: !!userAddress,
							hasEscrowData: !!escrowData,
							currentStatus,
							latestNostrStatus
						});

						// Use Nostr status with basic action logic
						if (latestNostrStatus === 'payment-released') {
							currentStatus = 'resolved';
							// No actions available when payment is released
							canDelete = false; // Payment released means it was funded
						} else {
							canComplete =
								data.isFreelancer &&
								currentStatus === 'active' &&
								latestNostrStatus !== 'task-completed';
							canAccept =
								data.isClient &&
								currentStatus === 'completed' &&
								latestNostrStatus !== 'payment-released';
							canDispute =
								data.isClient &&
								currentStatus === 'completed' &&
								latestNostrStatus !== 'payment-released';
							canPropose = data.isFreelancer && currentStatus === 'disputed';
							canAcceptProposal = data.isClient && currentStatus === 'disputed';
							canCancel = currentStatus === 'active';
							canResolveTimelock = currentStatus === 'disputed';
							
							// If no escrow data, check if contract has transaction hash
							if (data.contractData.transactionHash) {
								canDelete = false; // Has transaction hash, funding might be in progress
							} else {
								canDelete = true; // No transaction hash, likely never funded
							}
						}
					}

					// NOW create the updated contract with RSK-synced status as the source of truth
					const updatedContract = { ...data.contractData, status: currentStatus as ContractStatus };

					if (disputeProposal) updatedContract.disputeProposal = disputeProposal;

					contracts.push({
						contract: updatedContract,
						contractEvent: data.contractCreationMessage.event,
						statusEvents: data.statusEvents,
						isClient: data.isClient,
						canComplete,
						canAccept,
						canDispute,
						canPropose,
						canAcceptProposal,
						canCancel,
						canResolveTimelock,
						canDelete
					});
				} catch (error) {
					console.error('[getUserContracts] Error processing contract', {
						escrowId: data.escrowId,
						error: error instanceof Error ? error.message : String(error),
						errorType: error?.constructor?.name,
						stack: error instanceof Error ? error.stack : undefined
					});
					continue;
				}
			}
		}

		const endTime = Date.now();
		const duration = endTime - startTime;
		console.log('[getUserContracts] Contract loading completed', {
			contractCount: contracts.length,
			duration: `${duration}ms`,
			filter
		});

		// Sort by creation time (newest first)
		return contracts.sort(
			(a: ContractWithEvents, b: ContractWithEvents) => b.contract.createdAt - a.contract.createdAt
		);
	} catch (error) {
		const endTime = Date.now();
		const duration = endTime - startTime;
		// Don't throw - return what we have so the UI doesn't break
		// Log the error but continue with any contracts we successfully loaded
		console.error('[getUserContracts] Error getting user contracts (returning partial results)', {
			error: error instanceof Error ? error.message : String(error),
			errorType: error?.constructor?.name,
			stack: error instanceof Error ? error.stack : undefined,
			contractsLoaded: contracts.length,
			duration: `${duration}ms`,
			filter
		});
		// Return whatever contracts we managed to load, even if some failed
		return contracts.sort(
			(a: ContractWithEvents, b: ContractWithEvents) => b.contract.createdAt - a.contract.createdAt
		);
	}
}

/**
 * Get contract messages by escrow ID from DMs
 */
async function getContractMessagesByEscrowId(
	escrowId: string
): Promise<{ plaintext: string; event: NostrEvent; senderPubkey: string }[]> {
	try {
		// Use optimized version that doesn't require decryption for better performance
		const { getMessagedPeopleOptimized } = await import('./nostr-message');
		const messagedPeople = await getMessagedPeopleOptimized();
		const contractMessages: { plaintext: string; event: NostrEvent; senderPubkey: string }[] = [];

		// Fetch message histories for all conversations in parallel (optimization)
		const { getMessageHistoryOptimized } = await import('./nostr-message');
		const messageHistoryPromises = messagedPeople.map(async (person) => {
			try {
				// Use optimized version that batches auth and uses worker
				return await getMessageHistoryOptimized(person.pubkey, { limit: 200 });
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
						(parsedContent.messageType === 'contract' ||
							parsedContent.messageType === 'contract-status') &&
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
 * Get status events for a specific contract from messages
 */
async function getContractStatusEventsFromMessages(
	escrowId: string,
	messages: { plaintext: string; event: NostrEvent; senderPubkey: string }[]
): Promise<ContractStatusEvent[]> {
	try {
		// Find the contract creation message to get client/freelancer info
		const contractCreationMessage = messages.find((msg) => {
			try {
				const content = JSON.parse(msg.plaintext);
				return content && typeof content === 'object' && content.messageType === 'contract';
			} catch {
				return false;
			}
		});

		if (!contractCreationMessage) return [];

		// Validate contract data structure
		let contractData: NostrContract;
		try {
			const parsed = JSON.parse(contractCreationMessage.plaintext);
			if (!parsed || typeof parsed !== 'object' || !parsed.escrowId || !parsed.taskId) {
				return []; // Invalid contract structure
			}
			contractData = parsed as NostrContract;
		} catch {
			return []; // Invalid JSON
		}
		const processedEvents: ContractStatusEvent[] = [];

		// Process status messages
		for (const message of messages) {
			try {
				const parsedContent = JSON.parse(message.plaintext);

				// Validate parsed content structure
				if (!parsedContent || typeof parsedContent !== 'object') continue;

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
 * Delete a contract event (Nostr DM)
 * Prevents deletion if contract is funded or funding is in progress
 * Allows deletion ONLY if contract was never funded or funding failed
 * Uses blockchain-level validation for security
 * @param contractEventId The ID of the contract event to delete
 * @param escrowId The escrow ID to check contract status
 * @throws EscrowError if deletion is not allowed or fails
 */
export async function deleteContract(contractEventId: string, escrowId: string): Promise<void> {
	const { EscrowError, EscrowErrorCode, isEscrowNotFoundError, isEscrowError } = await import(
		'$lib/utils/errors/escrowErrors'
	);
	
	try {
		// Use blockchain-level validation to check if escrow was ever funded
		const fundingStatus = await escrow.checkEscrowFundingStatus(escrowId);
		
		// If there was an error checking escrow status, throw it
		if (fundingStatus.error) {
			throw new EscrowError(
				EscrowErrorCode.ESCROW_VERIFICATION_FAILED,
				'Cannot delete contract: Unable to verify escrow status',
				fundingStatus.error
			);
		}
		
		// If escrow was funded, prevent deletion
		if (fundingStatus.wasFunded) {
			const escrowData = fundingStatus.escrowData;
			if (escrowData) {
				// Check if funding is in progress (has transaction hash but not funded yet)
				// This is a safety check - if escrow exists and was funded, it's already funded
				// But we check transaction hash as an additional safeguard
				
				// Get contract data to check for transaction hash
				let contractData: NostrContract | null = null;
				try {
					const contractMessages = await getContractMessagesByEscrowId(escrowId);
					
					if (contractMessages.length > 0) {
						const contractCreationMessage = contractMessages.find((msg) => {
							try {
								const content = JSON.parse(msg.plaintext);
								return content.messageType === 'contract';
							} catch {
								return false;
							}
						});

						if (contractCreationMessage) {
							contractData = JSON.parse(contractCreationMessage.plaintext);
						}
					}
				} catch (error) {
					// If we can't get contract messages, still prevent deletion since escrow was funded
					console.warn(
						'Failed to get contract messages, but escrow was funded - preventing deletion:',
						error
					);
				}
				
				// Prevent deletion based on escrow status
				if (
					escrowData.status === EscrowStatus.Funded ||
					escrowData.status === EscrowStatus.InDispute ||
					escrowData.status === EscrowStatus.DisputeResolved ||
					escrowData.status === EscrowStatus.DisputeUnresolved ||
					escrowData.status === EscrowStatus.Completed
				) {
					throw new EscrowError(
						EscrowErrorCode.ESCROW_FUNDED,
						'Cannot delete contract: Contract has been funded and cannot be deleted'
					);
				}
				
				// For cancelled contracts that were funded
				if (escrowData.status === EscrowStatus.Cancelled) {
					throw new EscrowError(
						EscrowErrorCode.ESCROW_FUNDED,
						'Cannot delete contract: Contract has been funded and cannot be deleted'
					);
				}
				
				// If escrow exists but status is unknown, check transaction hash
				if (contractData?.transactionHash) {
					throw new EscrowError(
						EscrowErrorCode.ESCROW_FUNDING_IN_PROGRESS,
						'Cannot delete contract: Funding is in progress'
					);
				}
			}
			
			// If escrow was funded but we can't determine status, prevent deletion
			throw new EscrowError(
				EscrowErrorCode.ESCROW_FUNDED,
				'Cannot delete contract: Contract has been funded and cannot be deleted'
			);
		}
		
		// Escrow was never funded - allow deletion
		// But check for transaction hash as additional safeguard for funding in progress
		let contractData: NostrContract | null = null;
		try {
			const contractMessages = await getContractMessagesByEscrowId(escrowId);
			
			if (contractMessages.length > 0) {
				const contractCreationMessage = contractMessages.find((msg) => {
					try {
						const content = JSON.parse(msg.plaintext);
						return content.messageType === 'contract';
					} catch {
						return false;
					}
				});

				if (contractCreationMessage) {
					contractData = JSON.parse(contractCreationMessage.plaintext);
				}
			}
		} catch (error) {
			// If we can't get contract messages, be conservative and disallow deletion
			console.warn('Failed to get contract messages, disallowing deletion for safety:', error);
			throw new EscrowError(
				EscrowErrorCode.ESCROW_VERIFICATION_FAILED,
				'Cannot delete contract: Unable to verify contract status'
			);
		}
		
		// If there's a transaction hash, funding might be in progress
		if (contractData?.transactionHash) {
			throw new EscrowError(
				EscrowErrorCode.ESCROW_FUNDING_IN_PROGRESS,
				'Cannot delete contract: Funding is in progress'
			);
		}

		// Allow deletion - escrow was never funded and no funding in progress

		// Create deletion event (kind 5)
		const event = {
			kind: 5,
			created_at: Math.floor(Date.now() / 1000),
			content: 'Contract deleted',
			tags: [
				['e', contractEventId] // Reference to event being deleted
			]
		};

		// Sign and publish
		const signedEvent = await getSignedEvent(event);
		const response = await nostrEventsService.deleteEvent(signedEvent);
		if (response.deleteCount === 0) {
			throw new EscrowError(
				EscrowErrorCode.ESCROW_VERIFICATION_FAILED,
				'Failed to delete contract: Deletion event was not published'
			);
		}

		console.log('Contract deleted successfully');
	} catch (error) {
		console.error('Failed to delete contract:', error);
		// If it's already an EscrowError, re-throw it
		if (isEscrowError(error)) {
			throw error;
		}
		// Otherwise, wrap it in an EscrowError
		throw new EscrowError(
			EscrowErrorCode.ESCROW_UNKNOWN_ERROR,
			`Failed to delete contract: ${error instanceof Error ? error.message : 'Unknown error'}`,
			error
		);
	}
}
