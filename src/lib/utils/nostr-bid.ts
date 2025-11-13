import type { Event as NostrEvent } from 'nostr-tools';
import type { BidMessage, NostrBid, NostrBidStatus } from '$lib/types/bid';
import { nip19 } from 'nostr-tools';
import { getNpub } from './nostrKeys';
import { sendDirectMessage, getMessageHistory, getMessagedPeople } from './nostr-message';
import type {
	NostrContract,
	NostrContractStatus,
	ContractWithEvents,
	ContractStatusEvent,
	CreateContractParams,
	PublishStatusParams,
	ContractFilter
} from '$lib/types/contract';
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
 * Get bid status messages from DMs
 */
async function getBidStatusMessages(taskId?: string): Promise<{ [bidId: string]: NostrBidStatus }> {
	try {
		// Get all people you've exchanged messages with
		const messagedPeople = await getMessagedPeople();
		const bidStatuses: { [bidId: string]: NostrBidStatus } = {};

		// Fetch message histories for all conversations in parallel
		const messageHistoryPromises = messagedPeople.map(async (person) => {
			try {
				return await getMessageHistory(person.pubkey, { limit: 100 });
			} catch (err) {
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
				} catch (parseError) {
					continue;
				}
			}
		}

		return bidStatuses;
	} catch (error) {
		console.error('Error getting bid status messages:', error);
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
		// Only log in development to reduce console noise
		if (import.meta.env.DEV) {
			console.debug('Using cached processed bid data');
		}
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
		const bidsWithStatus = deduplicatedBids.map(bidMessage => {
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
			// Only log in development to reduce console noise
			if (import.meta.env.DEV) {
				console.debug('Using cached task bid data');
			}
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
		console.error('Error sending bid status update:', error);
		throw error;
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
		// Use getAuthOnce() to share auth singleton with getMessageHistoryOptimized()
		// This prevents multiple auth prompts when both are called
		const { getAuthOnce } = await import('./nostr-message');
		const { npub } = await getAuthOnce();
		const userPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// OPTIMIZATION 1: Use optimized version that doesn't require decryption
		const { getMessagedPeopleOptimized } = await import('./nostr-message');
		const messagedPeople = await getMessagedPeopleOptimized();
		const contracts: ContractWithEvents[] = [];

		// OPTIMIZATION 2 & 3: Parallelize message history fetching and use optimized version
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

		// Wait for all message histories in parallel (instead of sequential loop)
		const messageHistories = await Promise.all(messageHistoryPromises);

		// Process all conversations with their message histories
		for (let i = 0; i < messagedPeople.length; i++) {
			const person = messagedPeople[i];
			const messageHistory = messageHistories[i];

			// Skip if no messages for this person
			if (!messageHistory || messageHistory.length === 0) continue;

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
						let latestNostrStatus = '';
						if (statusEvents.length > 0) {
							latestNostrStatus = statusEvents[statusEvents.length - 1].status.action;
							// Update status based on latest action
							switch (latestNostrStatus) {
								case 'task-completed':
									currentStatus = 'completed';
									// Update contract with completion attachments if available
									if (statusEvents[statusEvents.length - 1].status.completionAttachments) {
										contractData.completionAttachments = statusEvents[statusEvents.length - 1].status.completionAttachments;
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

						// Determine available actions by checking actual RSK contract state
						let canComplete = false;
						let canAccept = false;
						let canDispute = false;
						let canPropose = false;
						let canAcceptProposal = false;
						let canCancel = false;
						let canResolveTimelock = false;
					let canDelete = false; // Can only delete if never funded or funding failed
						let disputeProposal = null;

						try {
							// Get actual escrow data from RSK contract
							let escrowData: any = null;
							try {
								escrowData = await escrow.getEscrow(contractData.escrowId);
							} catch (escrowError) {
								// Silently handle escrow fetch errors - contract might not exist on-chain yet
								// This is expected for contracts that were never funded
								console.warn(`Escrow ${contractData.escrowId} not found or invalid, using Nostr status only:`, escrowError);
								escrowData = null;
							}

							const userAddress = get(rskAddress);

							// Only load dispute proposal if contract is in dispute
							if (escrowData && escrowData.status === 1) { // EscrowStatus.InDispute
								try {
									disputeProposal = await escrow.getDisputeProposal(contractData.escrowId);
									// total amount
									if (disputeProposal) {
										const totalAmount = parseFloat(escrowData.baseAmount);
										const freelancerAmount = parseFloat(disputeProposal.freelancerAmount);
										disputeProposal.clientAmount = (totalAmount - freelancerAmount).toString();
									}
								} catch (disputeError) {
									// Silently handle dispute proposal fetch errors
									console.warn(`Failed to load dispute proposal for escrow ${contractData.escrowId}:`, disputeError);
									disputeProposal = null;
								}
							}

							console.log(`Contract ${contractData.escrowId}: RSK status = ${escrowData?.status} (${escrowData ? ['Funded', 'InDispute', 'DisputeResolved', 'DisputeUnresolved', 'Completed', 'Cancelled'][escrowData.status] || 'Unknown' : 'No Data'})`);

							if (escrowData && userAddress) {
							// Use blockchain-level validation to check if escrow was ever funded
							// This is more reliable than checking transaction hash
							let fundingStatus: any = null;
							try {
								fundingStatus = await escrow.checkEscrowFundingStatus(contractData.escrowId);
							} catch (fundingError) {
								// Silently handle funding status check errors
								console.warn(`Failed to check funding status for escrow ${contractData.escrowId}:`, fundingError);
								// Default to conservative values
								fundingStatus = { wasFunded: false };
							}
							
								// RSK contract state is the source of truth, but Nostr status events provide additional context
								// Use latest Nostr status event to determine if certain actions have been completed
								switch (escrowData.status) {
									case EscrowStatus.Funded: // 0
										// Keep Nostr status if it's more specific, otherwise use 'active'
										if (currentStatus !== 'completed' && currentStatus !== 'disputed') {
											currentStatus = 'active';
										}
										canComplete = isFreelancer && latestNostrStatus !== 'task-completed';
										canCancel = true; // Either party can cancel when funded
									canDelete = false; // Cannot delete if funded
										break;

									case EscrowStatus.InDispute: // 1
										currentStatus = 'disputed';

										// Only taskee (freelancer) can propose resolution if no active proposal exists
										canPropose = isFreelancer && !disputeProposal;

										// Only tasker (client) can accept proposal if:
										// 1. Proposal exists
										// 2. User is the client (not the proposer who is the freelancer)
										canAcceptProposal = isClient && !!disputeProposal;

										// Can resolve after timelock if timelock has expired
										canResolveTimelock = Date.now() > (escrowData.timelockExpiry * 1000);
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
											canAccept = isClient;
											canDispute = isClient;
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
								console.warn('RSK escrow data unavailable, falling back to Nostr status');

								// Use Nostr status with basic action logic
								if (latestNostrStatus === 'payment-released') {
									currentStatus = 'resolved';
									// No actions available when payment is released
								canDelete = false; // Payment released means it was funded
								} else {
									canComplete = isFreelancer && currentStatus === 'active' && latestNostrStatus !== 'task-completed';
									canAccept = isClient && currentStatus === 'completed' && latestNostrStatus !== 'payment-released';
									canDispute = isClient && currentStatus === 'completed' && latestNostrStatus !== 'payment-released';
									canPropose = isFreelancer && currentStatus === 'disputed';
									canAcceptProposal = isClient && currentStatus === 'disputed';
									canCancel = currentStatus === 'active';
									canResolveTimelock = currentStatus === 'disputed';
								
								// If no escrow data, check if contract has transaction hash
								if (contractData.transactionHash) {
									canDelete = false; // Has transaction hash, funding might be in progress
								} else {
									canDelete = true; // No transaction hash, likely never funded
								}
								}
							}
						} catch (error) {
						// Use structured error handling instead of string matching
						const { isEscrowNotFoundError, isNetworkError } = await import('$lib/utils/errors/escrowErrors');
						
						if (isEscrowNotFoundError(error)) {
							// Escrow doesn't exist - contract was never funded, allow deletion
							canDelete = true;
						} else if (isNetworkError(error)) {
							// Network error - be conservative and disallow deletion
							canDelete = false;
							console.warn('Network error while checking RSK contract state, disallowing deletion for safety:', error);
						} else {
							// Other error - be conservative and disallow deletion
							canDelete = false;
							console.warn('Failed to check RSK contract state, disallowing deletion for safety:', error);
						}
						
							// If RSK check fails, fall back to Nostr status
							console.warn('Failed to check RSK contract state, using Nostr status:', error);

							// Use Nostr status with basic action logic
							if (latestNostrStatus === 'payment-released') {
								currentStatus = 'resolved';
								// No actions available when payment is released
							canDelete = false; // Payment released means it was funded
							} else {
								canComplete = isFreelancer && currentStatus === 'active' && latestNostrStatus !== 'task-completed';
								canAccept = isClient && currentStatus === 'completed' && latestNostrStatus !== 'payment-released';
								canDispute = isClient && currentStatus === 'completed' && latestNostrStatus !== 'payment-released';
								canPropose = isFreelancer && currentStatus === 'disputed';
								canAcceptProposal = isClient && currentStatus === 'disputed';
								canCancel = currentStatus === 'active';
								canResolveTimelock = currentStatus === 'disputed';
							
							// Only override canDelete if escrow truly doesn't exist
							const { isEscrowNotFoundError: isNotFound } = await import('$lib/utils/errors/escrowErrors');
							if (!isNotFound(error)) {
								// If escrow check failed for other reasons, check if contract has transaction hash
								if (contractData.transactionHash) {
									canDelete = false; // Has transaction hash, might have been funded
								} else {
									// No transaction hash, but we can't be certain - be conservative
									canDelete = false; // Default to false for safety
								}
							}
							}
						}

						// NOW create the updated contract with RSK-synced status as the source of truth
						const updatedContract = { ...contractData, status: currentStatus };

						if (disputeProposal) updatedContract.disputeProposal = disputeProposal;

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
					} catch (error) {
						console.warn('Failed to parse contract messages:', error);
						continue;
					}
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
 * Delete a contract event (Nostr DM)
 * Prevents deletion if contract is funded or funding is in progress
 * Allows deletion ONLY if contract was never funded or funding failed
 * Uses blockchain-level validation for security
 * @param contractEventId The ID of the contract event to delete
 * @param escrowId The escrow ID to check contract status
 * @throws EscrowError if deletion is not allowed or fails
 */
export async function deleteContract(contractEventId: string, escrowId: string): Promise<void> {
	const { EscrowError, EscrowErrorCode, isEscrowNotFoundError, isEscrowError } = await import('$lib/utils/errors/escrowErrors');
	
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
						const contractCreationMessage = contractMessages.find(msg => {
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
					console.warn('Failed to get contract messages, but escrow was funded - preventing deletion:', error);
				}
				
				// Prevent deletion based on escrow status
				if (escrowData.status === EscrowStatus.Funded ||
					escrowData.status === EscrowStatus.InDispute ||
					escrowData.status === EscrowStatus.DisputeResolved ||
					escrowData.status === EscrowStatus.DisputeUnresolved ||
					escrowData.status === EscrowStatus.Completed) {
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
				const contractCreationMessage = contractMessages.find(msg => {
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