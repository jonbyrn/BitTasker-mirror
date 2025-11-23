import type { Event as NostrEvent } from 'nostr-tools';
import type { BidMessage, NostrBid, NostrBidStatus } from '$lib/types/bid';
import { nip19 } from 'nostr-tools';
import { getNpub } from './nostrKeys';
import { sendDirectMessage, getMessageHistory } from './nostr-message';
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
	private cache = new Map<string, CacheEntry<unknown>>();
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

		return entry.data as T;
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
	try {
		// Get all people you've exchanged messages with
		// Use optimized version to avoid multiple auth prompts
		const { getMessagedPeopleOptimized } = await import('./nostr-message');
		const messagedPeople = await getMessagedPeopleOptimized();
		const bidStatuses: { [bidId: string]: NostrBidStatus } = {};

		// Fetch message histories for all conversations in parallel
		const messageHistoryPromises = messagedPeople.map(async (person) => {
			try {
				return await getMessageHistory(person.pubkey, { limit: 100 });
			} catch {
				return [];
			}
		});

		const messageHistories = await Promise.all(messageHistoryPromises);

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
				} catch {
					continue;
				}
			}
		}

		return bidStatuses;
	} catch {
		return {};
	}
}

/**
 * Get bids for a specific task with optimized processing
 */
export async function getBidsForTaskOptimized(taskId: string): Promise<BidMessage[]> {
	const cacheKey = `task-optimized-${taskId}`;

	// Check if we have cached processed data
	const cachedData = bidCache.getProcessedBidData(cacheKey);
	if (cachedData) {
		return cachedData.transformedBids;
	}

	try {
		// Get raw bids from DMs
		const dmBids = await getBidsFromDMs(taskId);

		// Get bid status messages
		const bidStatuses = await getBidStatusMessages(taskId);

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

		return sortedBids;
	} catch {
		// Don't throw - return what we have so the UI doesn't break
		// Return empty array if we couldn't load any bids
		return [];
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
			return cachedBids;
		}

		// Get all people you've exchanged messages with
		// Use optimized version that doesn't require decryption for better performance
		const { getMessagedPeopleOptimized } = await import('./nostr-message');
		const messagedPeople = await getMessagedPeopleOptimized();
		const bids: BidMessage[] = [];

		// Fetch message histories for all conversations in parallel
		const messageHistoryPromises = messagedPeople.map(async (person) => {
			try {
				return await getMessageHistory(person.pubkey, { limit: 100 });
			} catch {
				// Return empty array for failed conversations
				return [];
			}
		});

		// Wait for all message histories to be fetched in parallel
		const messageHistories = await Promise.all(messageHistoryPromises);

		// Process all message histories to extract bids
		for (let i = 0; i < messagedPeople.length; i++) {
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
				} catch {
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
	} catch {
		// Don't throw - return what we have so the UI doesn't break
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
			return cachedBids;
		}

		// Get all people you've exchanged messages with
		// Use optimized version that doesn't require decryption for better performance
		const { getMessagedPeopleOptimized } = await import('./nostr-message');
		const messagedPeople = await getMessagedPeopleOptimized();
		const bids: BidMessage[] = [];

		// Fetch message histories for all conversations in parallel
		const messageHistoryPromises = messagedPeople.map(async (person) => {
			try {
				return await getMessageHistory(person.pubkey, { limit: 100 });
			} catch {
				// Skip this conversation if there's an error
				return [];
			}
		});

		// Wait for all message histories to be fetched in parallel
		const messageHistories = await Promise.all(messageHistoryPromises);

		// Process all message histories to extract bids
		for (let i = 0; i < messagedPeople.length; i++) {
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
				} catch {
					continue;
				}
			}
		}

		const sortedBids = bids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);

		// Cache the results for 5 minutes
		bidCache.set(cacheKey, sortedBids, 5);

		return sortedBids;
	} catch {
		// Don't throw - return what we have so the UI doesn't break
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
	} catch {
		// Log error but don't throw - allow UI to continue
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
	} catch {
		// Log error but don't throw - allow UI to continue
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
	} catch {
		// Log error but don't throw - allow UI to continue
		// Don't throw - let the caller handle the error if needed
		// The UI should show a warning but not break
	}
}

/**
 * Helper function to determine contract status and actions based on Nostr events (fallback when RSK data unavailable)
 * Priority order: cancelled > disputed > task-completed > payment-released > other
 */
function determineNostrFallbackStatus(
	currentStatus: string,
	latestNostrStatus: string | null,
	statusEvents: ContractStatusEvent[],
	contractData: NostrContract,
	isClient: boolean,
	isFreelancer: boolean,
	error?: unknown,
	isEscrowNotFoundError?: ((error: unknown) => boolean) | null,
	isNetworkError?: ((error: unknown) => boolean) | null
): {
	currentStatus: ContractStatus;
	canComplete: boolean;
	canAccept: boolean;
	canDispute: boolean;
	canPropose: boolean;
	canAcceptProposal: boolean;
	canCancel: boolean;
	canResolveTimelock: boolean;
	canDelete: boolean;
} {
	const hasTaskCompleted = statusEvents.some(e => e.status.action === 'task-completed');
	const hasPaymentReleased = statusEvents.some(e => e.status.action === 'payment-released');
	const hasDispute = statusEvents.some(e => e.status.action === 'dispute-raised');

	let status: ContractStatus = currentStatus as ContractStatus;
	let canComplete = false;
	let canAccept = false;
	let canDispute = false;
	let canPropose = false;
	let canAcceptProposal = false;
	let canCancel = false;
	const canResolveTimelock = false;
	let canDelete = false;

	// CRITICAL: Check status in priority order: cancelled > disputed > completed > resolved > active
	// Preserve cancelled and completed statuses if they're already set
	if (status === 'cancelled' || latestNostrStatus === 'contract-cancelled' || latestNostrStatus === 'escrow-cancelled') {
		status = 'cancelled';
		canCancel = false;
		canComplete = false;
		canAccept = false;
		canDispute = false;
		canPropose = false;
		canAcceptProposal = false;
		canDelete = contractData.transactionHash ? false : true;
	} else if (status === 'disputed' || hasDispute || latestNostrStatus === 'dispute-raised') {
		status = 'disputed';
		canPropose = isFreelancer;
		canAcceptProposal = isClient;
		canCancel = false;
		canDelete = false;
	} else if (status === 'completed' || hasTaskCompleted) {
		// Preserve completed status if already set, or set it if task is completed
		status = 'completed';
		canCancel = false;
		canComplete = false;
		if (!hasPaymentReleased) {
			canAccept = isClient;
			canDispute = isClient;
		}
		canDelete = false;
	} else if (status === 'resolved' || latestNostrStatus === 'payment-released') {
		status = 'resolved';
		canCancel = false;
		canComplete = false;
		canAccept = false;
		canDispute = false;
		canDelete = false;
	} else {
		// Only set to active if not already cancelled, disputed, completed, or resolved
		// At this point, status can only be 'active' or another value that needs to be set to 'active'
		status = 'active';
		canComplete = isFreelancer;
		canCancel = true;
		
		// Determine canDelete based on error type (only in catch block)
		if (error && isEscrowNotFoundError && isEscrowNotFoundError(error)) {
			canDelete = true;
		} else if (error && isNetworkError && isNetworkError(error)) {
			canDelete = false;
		} else {
			canDelete = contractData.transactionHash ? false : true;
		}
	}

	return {
		currentStatus: status,
		canComplete,
		canAccept,
		canDispute,
		canPropose,
		canAcceptProposal,
		canCancel,
		canResolveTimelock,
		canDelete
	};
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
		const { getAuthOnce } = await import('./nostr-message');
		const { npub } = await getAuthOnce();
		const userPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// OPTIMIZATION 1: Use optimized version that doesn't require decryption
		const { getMessagedPeopleOptimized } = await import('./nostr-message');
		const messagedPeople = await getMessagedPeopleOptimized();

		// OPTIMIZATION 2 & 3: Parallelize message history fetching and use optimized version
		const { getMessageHistoryOptimized } = await import('./nostr-message');
		const messageHistoryPromises = messagedPeople.map(async (person) => {
			try {
				// Use optimized version that batches auth and uses worker
				const history = await getMessageHistoryOptimized(person.pubkey, { limit: 200 });
				return history;
			} catch {
				return [];
			}
		});

		// Wait for all message histories in parallel (instead of sequential loop)
		const messageHistories = await Promise.all(messageHistoryPromises);

		console.log('[getUserContracts] Processing conversations', {
			totalConversations: messagedPeople.length,
			conversationsWithMessages: messageHistories.filter(h => h && h.length > 0).length,
			conversationDetails: messagedPeople.map((person, idx) => ({
				index: idx + 1,
				pubkey: person.pubkey.substring(0, 16) + '...',
				messageCount: messageHistories[idx]?.length || 0
			}))
		});

		let contractCount = 0;
		for (let i = 0; i < messagedPeople.length; i++) {
			const person = messagedPeople[i];
			const messageHistory = messageHistories[i];

			// Skip if no messages for this person
			if (!messageHistory || messageHistory.length === 0) {
				console.log(`[getUserContracts] Skipping conversation ${i + 1} - no messages`, {
					conversationIndex: i + 1,
					pubkey: person.pubkey.substring(0, 16) + '...'
				});
				continue;
			}

			// Group messages by escrow ID
			const contractMessages = new Map<
				string,
				{ plaintext: string; event: NostrEvent; senderPubkey: string }[]
			>();

			for (const message of messageHistory) {
				try {
					if (!message.plaintext || message.plaintext.trim() === '') {
						console.log(`[getUserContracts] Empty message in conversation ${i + 1}`, {
							conversationIndex: i + 1,
							pubkey: person.pubkey.substring(0, 16) + '...',
							hasPlaintext: !!message.plaintext,
							plaintextLength: message.plaintext?.length || 0
						});
						continue;
					}

					// DEBUG: Log full decrypted message
					console.log(`[getUserContracts] Decrypted message in conversation ${i + 1}`, {
						conversationIndex: i + 1,
						pubkey: person.pubkey.substring(0, 16) + '...',
						plaintext: message.plaintext,
						plaintextLength: message.plaintext.length,
						senderPubkey: message.senderPubkey.substring(0, 16) + '...',
						eventId: message.event.id.substring(0, 16) + '...',
						createdAt: new Date(message.event.created_at * 1000).toISOString()
					});

					let parsedContent;
					try {
						parsedContent = JSON.parse(message.plaintext);
					} catch (parseError) {
						// DEBUG: Log messages that fail to parse as JSON
						console.log(`[getUserContracts] Failed to parse JSON in conversation ${i + 1}`, {
							conversationIndex: i + 1,
							pubkey: person.pubkey.substring(0, 16) + '...',
							plaintext: message.plaintext,
							plaintextLength: message.plaintext.length,
							plaintextPreview: message.plaintext.substring(0, 200),
							parseError: parseError instanceof Error ? parseError.message : String(parseError),
							senderPubkey: message.senderPubkey.substring(0, 16) + '...',
							eventId: message.event.id.substring(0, 16) + '...'
						});
						continue;
					}

					// DEBUG: Log parsed content
					console.log(`[getUserContracts] Parsed message content in conversation ${i + 1}`, {
						conversationIndex: i + 1,
						pubkey: person.pubkey.substring(0, 16) + '...',
						parsedContent,
						messageType: parsedContent?.messageType,
						escrowId: parsedContent?.escrowId,
						action: parsedContent?.action,
						taskId: parsedContent?.taskId,
						bidId: parsedContent?.bidId
					});

					// Validate parsed content structure
					if (!parsedContent || typeof parsedContent !== 'object') {
						console.log(`[getUserContracts] Invalid parsed content structure in conversation ${i + 1}`, {
							conversationIndex: i + 1,
							pubkey: person.pubkey.substring(0, 16) + '...',
							parsedContent,
							typeofParsedContent: typeof parsedContent,
							isObject: typeof parsedContent === 'object'
						});
						continue;
					}

					// Check if it's a contract-related message
					if (
						parsedContent.messageType === 'contract' ||
						parsedContent.messageType === 'contract-status'
					) {
						const escrowId = parsedContent.escrowId;
						if (escrowId && typeof escrowId === 'string') {
							// For contract-status messages, validate contractEventId matches expected pattern OR event ID
							// This provides early filtering to prevent incorrect grouping
							// Note: We can't check the actual event ID here since we don't have the contract creation message yet
							// So we only filter out obvious mismatches (non-matching expected format)
							// The full validation happens later in getContractStatusEventsFromMessages
							if (parsedContent.messageType === 'contract-status') {
								const expectedContractEventId = `contract-${escrowId}`;
								// Only filter if contractEventId exists and doesn't match expected format
								// We'll do full validation (including event ID check) later
								if (parsedContent.contractEventId && 
									parsedContent.contractEventId !== expectedContractEventId &&
									// Don't filter if it looks like a Nostr event ID (64 char hex) - validate later
									parsedContent.contractEventId.length !== 64) {
									// Don't skip here - let it through for full validation later
									// This allows events with Nostr event IDs to pass through
								}
							}
							
							if (!contractMessages.has(escrowId)) {
								contractMessages.set(escrowId, []);
							}
							contractMessages.get(escrowId)!.push(message);
						}
					}
				} catch {
					// Not a contract message, continue
					continue;
				}
			}

			// Log all escrowIds found in this conversation
			if (contractMessages.size > 0) {
				console.log(`[getUserContracts] Found ${contractMessages.size} unique escrowId(s) in conversation ${i + 1}`, {
					escrowIds: Array.from(contractMessages.keys()),
					pubkey: person.pubkey.substring(0, 16) + '...',
					totalMessages: messageHistory.length,
					messagesPerEscrowId: Array.from(contractMessages.entries()).map(([id, msgs]) => ({
						escrowId: id,
						messageCount: msgs.length,
						messageTypes: msgs.map(m => {
							try {
								const parsed = JSON.parse(m.plaintext);
								return parsed?.messageType || 'unknown';
							} catch {
								return 'invalid-json';
							}
						})
					}))
				});
			} else {
				console.log(`[getUserContracts] No contract messages found in conversation ${i + 1}`, {
					conversationIndex: i + 1,
					pubkey: person.pubkey.substring(0, 16) + '...',
					totalMessages: messageHistory.length,
					sampleMessageTypes: messageHistory.slice(0, 5).map(m => {
						try {
							const parsed = JSON.parse(m.plaintext);
							return parsed?.messageType || 'not-json';
						} catch {
							return 'invalid-json';
						}
					})
				});
			}

			// Process each contract
			for (const [escrowId, messages] of contractMessages.entries()) {
				contractCount++;
				console.log(`[getUserContracts] Processing contract ${contractCount}`, {
					escrowId,
					messageCount: messages.length,
					conversationIndex: i + 1,
					pubkey: person.pubkey.substring(0, 16) + '...'
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
						console.warn(`[getUserContracts] ⚠️ No contract creation message found for escrow ${escrowId}`, {
							escrowId,
							messageCount: messages.length,
							messageTypes: messages.map(m => {
								try {
									const parsed = JSON.parse(m.plaintext);
									return parsed?.messageType || 'unknown';
								} catch {
									return 'invalid-json';
								}
							}),
							conversationIndex: i + 1,
							pubkey: person.pubkey.substring(0, 16) + '...'
						});
						continue;
					}
					console.log(`[getUserContracts] ✅ Contract creation message found for escrow ${escrowId}`, {
						escrowId,
						eventId: contractCreationMessage.event.id.substring(0, 16) + '...',
						createdAt: new Date(contractCreationMessage.event.created_at * 1000).toISOString()
					});

					// Validate contract data structure
					let contractData: NostrContract;
					try {
						const parsed = JSON.parse(contractCreationMessage.plaintext);
						if (!parsed || typeof parsed !== 'object' || !parsed.escrowId || !parsed.taskId) {
							console.warn(`[getUserContracts] ⚠️ Invalid contract structure for escrow ${escrowId}`, {
								escrowId,
								hasEscrowId: !!parsed?.escrowId,
								hasTaskId: !!parsed?.taskId,
								isObject: typeof parsed === 'object'
							});
							continue; // Invalid contract structure
						}
						contractData = parsed as NostrContract;
						
						// CRITICAL: Validate that the contract creation message's escrowId matches the map key escrowId
						// This prevents processing contracts with mismatched escrowIds that may have been incorrectly grouped
						if (contractData.escrowId !== escrowId) {
							console.warn(`[getUserContracts] ⚠️ Contract escrowId mismatch for escrow ${escrowId}`, {
								expectedEscrowId: escrowId,
								actualEscrowId: contractData.escrowId,
								taskId: contractData.taskId
							});
							continue; // Contract escrowId doesn't match map key - skip this contract
						}
					} catch (parseError) {
						console.warn(`[getUserContracts] ⚠️ Failed to parse contract data for escrow ${escrowId}`, {
							escrowId,
							error: parseError instanceof Error ? parseError.message : String(parseError)
						});
						continue; // Invalid JSON
					}

					// Check if user is involved in this contract
					const isClient = contractData.clientPubkey === userPubkey;
					const isFreelancer = contractData.freelancerPubkey === userPubkey;

					console.log(`[getUserContracts] Checking user involvement for escrow ${escrowId}`, {
						escrowId,
						userPubkey: userPubkey.substring(0, 16) + '...',
						clientPubkey: contractData.clientPubkey.substring(0, 16) + '...',
						freelancerPubkey: contractData.freelancerPubkey.substring(0, 16) + '...',
						isClient,
						isFreelancer
					});

					if (!isClient && !isFreelancer) {
						console.warn(`[getUserContracts] ⚠️ User not involved in contract escrow ${escrowId}`, {
							escrowId,
							userPubkey: userPubkey.substring(0, 16) + '...',
							clientPubkey: contractData.clientPubkey.substring(0, 16) + '...',
							freelancerPubkey: contractData.freelancerPubkey.substring(0, 16) + '...'
						});
						continue;
					}

					// Apply additional filters
					if (filter?.escrowIds && !filter.escrowIds.includes(contractData.escrowId)) {
						console.log(`[getUserContracts] Contract filtered out by escrowIds filter`, {
							escrowId: contractData.escrowId,
							filterEscrowIds: filter.escrowIds
						});
						continue;
					}
					if (filter?.taskIds && !filter.taskIds.includes(contractData.taskId)) {
						console.log(`[getUserContracts] Contract filtered out by taskIds filter`, {
							escrowId: contractData.escrowId,
							taskId: contractData.taskId,
							filterTaskIds: filter.taskIds
						});
						continue;
					}
					if (filter?.statuses && !filter.statuses.includes(contractData.status)) {
						console.log(`[getUserContracts] Contract filtered out by statuses filter`, {
							escrowId: contractData.escrowId,
							contractStatus: contractData.status,
							filterStatuses: filter.statuses
						});
						continue;
					}

					// CRITICAL: FIRST check ALL messages for key statuses (cancelled, disputed, task-completed) 
					// even if they don't pass contractEventId validation
					// This ensures we detect these statuses even if contractEventId validation fails
					// We check ALL messages because status events might be filtered out due to contractEventId mismatches
					// Priority: cancelled > disputed > task-completed
					let hasCancelledStatusInAnyMessage = false;
					let hasDisputeStatusInAnyMessage = false;
					let hasTaskCompletedInAnyMessage = false;
					
					for (const message of messages) {
						try {
							const parsedContent = JSON.parse(message.plaintext);
							if (parsedContent && typeof parsedContent === 'object' && 
								parsedContent.messageType === 'contract-status' &&
								parsedContent.escrowId === escrowId) {
								const action = parsedContent.action;
								// Check for both 'contract-cancelled' (Nostr) and 'escrow-cancelled' (blockchain)
								if (action === 'contract-cancelled' || action === 'escrow-cancelled') {
									hasCancelledStatusInAnyMessage = true;
								} else if (action === 'dispute-raised') {
									hasDisputeStatusInAnyMessage = true;
								} else if (action === 'task-completed') {
									hasTaskCompletedInAnyMessage = true;
								}
							}
						} catch {
							// Not a valid JSON message, continue
							continue;
						}
					}

					// Get status events for this contract (filtered by contractEventId validation)
					let statusEvents: ContractStatusEvent[] = [];
					try {
						statusEvents = await getContractStatusEventsFromMessages(escrowId, messages);
					} catch {
						// Silently handle status event parsing errors
						statusEvents = [];
					}

					// Determine current status - start with contract's initial status
					// CRITICAL: Don't set status to 'resolved' here - only blockchain status can determine 'resolved'
					// 'resolved' means DisputeResolved/DisputeUnresolved on blockchain, not just a payment-released Nostr event
					// CRITICAL: Don't set status from messages here - wait for blockchain status first
					// However, we DO check for task-completed in ALL messages as a fallback if blockchain data is unavailable
					// Blockchain status is the source of truth for active/completed/resolved when available
					let currentStatus = contractData.status;
					let latestNostrStatus = '';
					
					// CRITICAL: Only set status from ALL messages for cancelled/disputed/task-completed (these take absolute priority)
					// Priority: cancelled > disputed > task-completed
					// Note: task-completed is checked here as a fallback, but blockchain status will override if available
					if (hasCancelledStatusInAnyMessage) {
						currentStatus = 'cancelled';
						// Try to find the actual cancelled action type from messages
						let cancelledAction = 'contract-cancelled'; // default
						for (const message of messages) {
							try {
								const parsedContent = JSON.parse(message.plaintext);
								if (parsedContent && typeof parsedContent === 'object' && 
									parsedContent.messageType === 'contract-status' &&
									parsedContent.escrowId === escrowId &&
									(parsedContent.action === 'contract-cancelled' || parsedContent.action === 'escrow-cancelled')) {
									cancelledAction = parsedContent.action;
									break; // Use the first cancelled action found
								}
							} catch {
								continue;
							}
						}
						latestNostrStatus = cancelledAction;
					} else if (hasDisputeStatusInAnyMessage) {
						currentStatus = 'disputed';
						latestNostrStatus = 'dispute-raised';
					} else if (hasTaskCompletedInAnyMessage) {
						// CRITICAL: Set to 'completed' if task-completed is found in ANY message
						// This ensures completed contracts are detected even if status events are filtered out
						// Blockchain status will still override this if escrow data is available
						currentStatus = 'completed';
						latestNostrStatus = 'task-completed';
						console.log(`[getUserContracts] ✅ Found task-completed in ALL messages for escrow ${escrowId}`, {
							escrowId,
							statusSetTo: 'completed'
						});
					}
					
					// Then update from filtered status events if available (but don't override cancelled/disputed)
					// CRITICAL: Don't overwrite latestNostrStatus if we already set it to 'contract-cancelled', 'escrow-cancelled', or 'dispute-raised'
					// Note: cancelled/disputed are already set from all messages check above, so we don't need to check again
					if (statusEvents.length > 0) {
						const filteredLatestStatus = statusEvents[statusEvents.length - 1].status.action;
						// Only update latestNostrStatus if we haven't already set it to cancelled/disputed from all messages
						if (currentStatus !== 'cancelled' && currentStatus !== 'disputed') {
							latestNostrStatus = filteredLatestStatus;
						}
						// Update contract data from status events, but don't override cancelled/disputed status
						// and don't set to 'resolved' or 'completed' here - blockchain will determine that
						if (currentStatus !== 'cancelled' && currentStatus !== 'disputed') {
							switch (filteredLatestStatus) {
								case 'task-completed':
									// Don't set to 'completed' here - blockchain status will determine if it's completed
									// Just update contract with completion attachments if available
									if (statusEvents[statusEvents.length - 1].status.completionAttachments) {
										contractData.completionAttachments =
											statusEvents[statusEvents.length - 1].status.completionAttachments;
									}
									break;
								case 'payment-released':
									// Don't set to 'resolved' here - only blockchain status can determine 'resolved'
									// If blockchain status is Completed, it should stay 'completed'
									// If blockchain status is DisputeResolved/DisputeUnresolved, it will be set to 'resolved' later
									// This is just a notification that payment was released, but blockchain status is source of truth
									// Keep current status (will be overridden by blockchain status if available)
									break;
								// Note: 'dispute-raised' and 'contract-cancelled' are already handled by all messages check above
								// No need to check again here since we've already set status from all messages
							}
						}
					}
					// Note: currentStatus will be overridden by escrow data status if escrow data exists
					// This ensures blockchain status is the source of truth for active/completed/resolved

					// Determine available actions by checking actual RSK contract state
					let canComplete = false;
					let canAccept = false;
					let canDispute = false;
					let canPropose = false;
					let canAcceptProposal = false;
					let canCancel = false;
					let canResolveTimelock = false;
					let canDelete = false; // Can only delete if never funded or funding failed
					let disputeProposal: DisputeProposal | null = null;
					// Declare escrowData outside try block so it's accessible for logging
					let escrowData: EscrowData | null = null;

					try {
						// Get actual escrow data from RSK contract
						console.log(`[getUserContracts] Fetching escrow data for ${contractData.escrowId}...`);
						try {
							escrowData = await escrow.getEscrow(contractData.escrowId);
							console.log(`[getUserContracts] ✅ Escrow data fetched for ${contractData.escrowId}`, {
								escrowId: contractData.escrowId,
								status: escrowData?.status,
								statusName: escrowData ? EscrowStatus[escrowData.status] : 'null',
								hasData: !!escrowData,
								baseAmount: escrowData?.baseAmount,
								client: escrowData?.client?.substring(0, 16) + '...',
								freelancer: escrowData?.freelancer?.substring(0, 16) + '...'
							});
						} catch (escrowError) {
							console.warn(`[getUserContracts] ⚠️ Failed to fetch escrow data for ${contractData.escrowId}`, {
								escrowId: contractData.escrowId,
								error: escrowError instanceof Error ? escrowError.message : String(escrowError),
								errorType: escrowError?.constructor?.name
							});
							// Silently handle expected "Invalid escrow ID" errors for contracts that were never funded
							escrowData = null;
						}

						// Safely get user address - handle potential store errors
						let userAddress: string | null = null;
						try {
							userAddress = get(rskAddress);
						} catch {
							// Silently handle store access errors
							userAddress = null;
						}

						// Only load dispute proposal if contract is in dispute
						if (escrowData && escrowData.status === EscrowStatus.InDispute) {
							try {
								disputeProposal = await escrow.getDisputeProposal(contractData.escrowId);
								// total amount
								if (disputeProposal) {
									const totalAmount = parseFloat(escrowData.baseAmount);
									const freelancerAmount = parseFloat(disputeProposal.freelancerAmount);
									disputeProposal.clientAmount = (totalAmount - freelancerAmount).toString();
								}
							} catch {
								// Silently handle dispute proposal fetch errors
								disputeProposal = null;
							}
						}

						if (escrowData) {
							// Use blockchain-level validation to check if escrow was ever funded
							// This is more reliable than checking transaction hash
							let fundingStatus: {
								wasFunded: boolean;
								escrowData?: EscrowData | null;
								error?: unknown;
							} | null = null;
							
							// Only check funding status if userAddress is available (needed for some checks)
							if (userAddress) {
								try {
									fundingStatus = await escrow.checkEscrowFundingStatus(contractData.escrowId);
								} catch {
									// Silently handle funding status check errors
									// Default to conservative values
									fundingStatus = { wasFunded: false };
								}
							}

							// RSK contract state is the source of truth, but Nostr status events provide additional context
							// Use latest Nostr status event to determine if certain actions have been completed
							// CRITICAL: Always set status from escrow data first, then adjust based on Nostr events
							// Note: We check escrowData.status even if userAddress is null, as status is independent of user address
							// CRITICAL: Preserve cancelled status from Nostr if escrow data shows cancelled - don't override with 'active'
							switch (escrowData.status) {
								case EscrowStatus.Funded: { // 0
									// CRITICAL: EscrowStatus.Funded means the contract is active (funded but not completed)
									// However, check Nostr status events for task-completed - blockchain status might not be updated yet
									// Always set to 'active' unless cancelled, disputed, or completed (those take priority)
									// Preserve cancelled, disputed, and completed statuses - don't override them
									
									// Check if task was completed in Nostr even if blockchain hasn't updated yet
									const hasTaskCompletedInEvents = statusEvents.some(e => e.status.action === 'task-completed');
									const shouldBeCompleted = hasTaskCompletedInEvents || currentStatus === 'completed';
									
									if (currentStatus !== 'cancelled' && currentStatus !== 'disputed' && !shouldBeCompleted) {
										currentStatus = 'active';
									} else if (shouldBeCompleted && currentStatus !== 'cancelled' && currentStatus !== 'disputed') {
										// Set to completed if we have task-completed events, even if blockchain shows Funded
										currentStatus = 'completed';
									}
									
									// CRITICAL: If status is cancelled (from Nostr), disable all actions including cancel
									if (currentStatus === 'cancelled') {
										canCancel = false;
										canComplete = false;
										canAccept = false;
										canDispute = false;
										canPropose = false;
										canAcceptProposal = false;
										canResolveTimelock = false;
									} else if (currentStatus === 'completed') {
										// Preserve completed status - payment may have been released but escrow still shows Funded
										// Only allow accept/dispute if payment hasn't been released yet
										if (latestNostrStatus !== 'payment-released') {
											canAccept = isClient;
											canDispute = isClient;
										}
										canCancel = false;
										canComplete = false;
									} else {
										canComplete = isFreelancer && latestNostrStatus !== 'task-completed';
										canCancel = true; // Either party can cancel when funded (and not already cancelled/completed)
									}
									canDelete = false; // Cannot delete if funded
									break;
								}

								case EscrowStatus.InDispute: // 1
									// Always set to disputed when escrow is in dispute
									currentStatus = 'disputed';

									// Only taskee (freelancer) can propose resolution if no active proposal exists
									canPropose = isFreelancer && !disputeProposal;

									// Only tasker (client) can accept proposal if:
									// 1. Proposal exists
									// 2. User is the client (not the proposer who is the freelancer)
									canAcceptProposal = isClient && !!disputeProposal;

									// Can resolve after timelock if timelock has expired
									canResolveTimelock = Date.now() > escrowData.timelockExpiry * 1000;
									canCancel = false; // Cannot cancel disputed contracts
									canDelete = false; // Cannot delete if funded (dispute means it was funded)
									break;

								case EscrowStatus.DisputeResolved: // 2
								case EscrowStatus.DisputeUnresolved: // 3
									// Always set to resolved when dispute is resolved
									currentStatus = 'resolved';
									// No actions available for resolved disputes
									canCancel = false; // Cannot cancel resolved contracts
									canComplete = false; // Cannot complete resolved contracts
									canAccept = false; // Cannot accept resolved contracts
									canDispute = false; // Cannot dispute resolved contracts
									canPropose = false; // Cannot propose on resolved contracts
									canAcceptProposal = false; // Cannot accept proposals on resolved contracts
									canResolveTimelock = false; // Cannot resolve timelock on resolved contracts
									canDelete = false; // Cannot delete if funded (resolved means it was funded)
									break;

								case EscrowStatus.Completed: // 4
									// CRITICAL: EscrowStatus.Completed means task is completed but payment not yet released
									// Always show as 'completed' - the blockchain status is the source of truth
									// If payment was actually released, the escrow status would be DisputeResolved/DisputeUnresolved
									currentStatus = 'completed';
									// Only allow accept/dispute if payment hasn't been released yet
									// Check Nostr events to see if payment was released (but don't override blockchain status)
									if (latestNostrStatus !== 'payment-released') {
										canAccept = isClient;
										canDispute = isClient;
									}
									// CRITICAL: Cannot cancel completed contracts
									canCancel = false;
									canDelete = false; // Cannot delete if funded (completed means it was funded)
									break;

								case EscrowStatus.Cancelled: // 5
									// CRITICAL: Always set to 'cancelled' when escrow status is Cancelled
									// This ensures contracts show as cancelled even if there are no Nostr status events
									currentStatus = 'cancelled';
									// No actions available for cancelled contracts
									// CRITICAL: Cannot cancel already-cancelled contracts
									canCancel = false;
									canComplete = false; // Cannot complete cancelled contracts
									canAccept = false; // Cannot accept cancelled contracts
									canDispute = false; // Cannot dispute cancelled contracts
									canPropose = false; // Cannot propose on cancelled contracts
									canAcceptProposal = false; // Cannot accept proposals on cancelled contracts
									canResolveTimelock = false; // Cannot resolve timelock on cancelled contracts
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

							const fallback = determineNostrFallbackStatus(
								currentStatus,
								latestNostrStatus,
								statusEvents,
								contractData,
								isClient,
								isFreelancer
							);
							currentStatus = fallback.currentStatus;
							canComplete = fallback.canComplete;
							canAccept = fallback.canAccept;
							canDispute = fallback.canDispute;
							canPropose = fallback.canPropose;
							canAcceptProposal = fallback.canAcceptProposal;
							canCancel = fallback.canCancel;
							canResolveTimelock = fallback.canResolveTimelock;
							canDelete = fallback.canDelete;
						}
					} catch (error) {
						// Use structured error handling instead of string matching
						let isEscrowNotFoundError: ((error: unknown) => boolean) | null = null;
						let isNetworkError: ((error: unknown) => boolean) | null = null;

						try {
							const errorUtils = await import('$lib/utils/errors/escrowErrors');
							isEscrowNotFoundError = errorUtils.isEscrowNotFoundError;
							isNetworkError = errorUtils.isNetworkError;
						} catch {
							// Silently handle import errors - use fallback logic
						}

						// If RSK check fails, fall back to Nostr status

						const fallback = determineNostrFallbackStatus(
							currentStatus,
							latestNostrStatus,
							statusEvents,
							contractData,
							isClient,
							isFreelancer,
							error,
							isEscrowNotFoundError,
							isNetworkError
						);
						currentStatus = fallback.currentStatus;
						canComplete = fallback.canComplete;
						canAccept = fallback.canAccept;
						canDispute = fallback.canDispute;
						canPropose = fallback.canPropose;
						canAcceptProposal = fallback.canAcceptProposal;
						canCancel = fallback.canCancel;
						canResolveTimelock = fallback.canResolveTimelock;
						canDelete = fallback.canDelete;
					}

					// CRITICAL: Final safeguard - if status is cancelled, completed, resolved, or disputed, ensure canCancel is false
					// This prevents any edge cases where canCancel might have been set incorrectly
					if (currentStatus === 'cancelled' || currentStatus === 'completed' || currentStatus === 'resolved' || currentStatus === 'disputed') {
						canCancel = false;
					}

					// NOW create the updated contract with RSK-synced status as the source of truth
					const updatedContract = { ...contractData, status: currentStatus };

					if (disputeProposal) updatedContract.disputeProposal = disputeProposal;

					console.log(`[getUserContracts] ✅ Adding contract to results for escrow ${contractData.escrowId}`, {
						escrowId: contractData.escrowId,
						taskId: contractData.taskId,
						finalStatus: currentStatus,
						originalStatus: contractData.status,
						escrowStatus: escrowData?.status,
						escrowStatusName: escrowData ? EscrowStatus[escrowData.status] : 'null',
						isClient,
						isFreelancer,
						statusEventsCount: statusEvents.length,
						canComplete,
						canAccept,
						canDispute,
						canCancel,
						canDelete
					});

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
						canResolveTimelock,
						canDelete
					});
				} catch {
					continue;
				}
			}
		}

		const endTime = Date.now();
		const duration = endTime - startTime;
		console.log('[getUserContracts] ✅ Contract loading completed', {
			contractCount: contracts.length,
			processedCount: contractCount,
			duration: `${duration}ms`,
			filter,
			escrowIds: contracts.map(c => c.contract.escrowId),
			statuses: contracts.map(c => c.contract.status),
			taskIds: contracts.map(c => c.contract.taskId),
			contractsSummary: contracts.map(c => ({
				escrowId: c.contract.escrowId,
				status: c.contract.status,
				taskId: c.contract.taskId,
				isClient: c.isClient,
				isFreelancer: !c.isClient,
				statusEventsCount: c.statusEvents.length
			}))
		});

		// Sort by creation time (newest first)
		// Note: Deduplication is handled in the component using Svelte's $derived
		return contracts.sort(
			(a: ContractWithEvents, b: ContractWithEvents) => b.contract.createdAt - a.contract.createdAt
		);
	} catch (error) {
		const endTime = Date.now();
		const duration = endTime - startTime;
		console.error('[getUserContracts] ❌ Error getting user contracts (returning partial results)', {
			error: error instanceof Error ? error.message : String(error),
			errorType: error?.constructor?.name,
			stack: error instanceof Error ? error.stack : undefined,
			contractsLoaded: contracts.length,
			duration: `${duration}ms`,
			filter
		});
		// Don't throw - return what we have so the UI doesn't break
		// Return whatever contracts we managed to load, even if some failed
		// Note: Deduplication is handled in the component using Svelte's $derived
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
			} catch {
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
				} catch {
					// Not a contract message, continue
					continue;
				}
			}
		}

		return contractMessages.sort((a, b) => a.event.created_at - b.event.created_at);
	} catch {
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
			
			// CRITICAL: Validate that the contract's escrowId matches the expected escrowId
			// This prevents processing status messages from different contracts
			if (contractData.escrowId !== escrowId) {
				return []; // Contract escrowId doesn't match - this is the wrong contract
			}
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
					// CRITICAL: Validate that the status message's escrowId matches the expected escrowId
					// This prevents processing status messages from different contracts that may have been incorrectly grouped
					if (parsedContent.escrowId !== escrowId) {
						continue; // Skip this status message - it belongs to a different contract
					}
					
					// CRITICAL: Validate that the status message's contractEventId matches the expected contract event ID
					// This ensures status events are associated with the correct contract creation event
					// Note: Accept multiple formats for backward compatibility:
					// 1. Expected format: `contract-{escrowId}`
					// 2. Nostr event ID: The actual event ID of the contract creation event
					// 3. Missing: Older events without contractEventId (allowed if escrowId matches)
					const expectedContractEventId = `contract-${escrowId}`;
					const contractCreationEventId = contractCreationMessage.event.id;
					
					if (parsedContent.contractEventId) {
						// Check if contractEventId matches expected format OR the actual contract creation event ID
						const matchesExpectedFormat = parsedContent.contractEventId === expectedContractEventId;
						const matchesEventId = parsedContent.contractEventId === contractCreationEventId;
						
						if (!matchesExpectedFormat && !matchesEventId) {
							continue; // Skip this status message - it references a different contract
						}
					}
					
					// CRITICAL: Validate that the status event timestamp is after contract creation
					// This prevents showing events from before the contract was created (e.g., from a different contract)
					// Use both contractData.createdAt and the contract creation event's created_at for validation
					// Allow a small window (5 minutes) to account for clock skew and timing differences
					const contractCreationTimestamp = contractData.createdAt || (contractCreationMessage.event.created_at * 1000);
					const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes tolerance
					if (parsedContent.timestamp && contractCreationTimestamp && parsedContent.timestamp < (contractCreationTimestamp - TIMESTAMP_TOLERANCE_MS)) {
						continue; // Skip this status message - it occurred significantly before contract creation
					}
					
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
			} catch {
				continue;
			}
		}

		// Sort by timestamp (oldest first for timeline)
		return processedEvents.sort((a, b) => a.status.timestamp - b.status.timestamp);
	} catch {
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
	const { EscrowError, EscrowErrorCode, isEscrowError } = await import(
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
				} catch {
					// If we can't get contract messages, still prevent deletion since escrow was funded
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
		} catch {
			// If we can't get contract messages, be conservative and disallow deletion
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
	} catch (error) {
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
