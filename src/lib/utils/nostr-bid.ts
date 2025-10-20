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
		console.log('Using cached processed bid data');
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
						let disputeProposal = null;

						try {
							// Get actual escrow data from RSK contract
							const escrowData = await escrow.getEscrow(contractData.escrowId);
							const userAddress = get(rskAddress);

							// Only load dispute proposal if contract is in dispute
							if (escrowData && escrowData.status === 1) { // EscrowStatus.InDispute
								disputeProposal = await escrow.getDisputeProposal(contractData.escrowId);
								// total amount
								if (disputeProposal) {
									const totalAmount = parseFloat(escrowData.baseAmount);
									const freelancerAmount = parseFloat(disputeProposal.freelancerAmount);
									disputeProposal.clientAmount = (totalAmount - freelancerAmount).toString();
								}
							}

							console.log(`Contract ${contractData.escrowId}: RSK status = ${escrowData?.status} (${escrowData ? ['Funded', 'InDispute', 'DisputeResolved', 'DisputeUnresolved', 'Completed', 'Cancelled'][escrowData.status] || 'Unknown' : 'No Data'})`);

							if (escrowData && userAddress) {
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
										break;

									case EscrowStatus.DisputeResolved: // 2
									case EscrowStatus.DisputeUnresolved: // 3
										currentStatus = 'resolved';
										// TODO: No actions available for resolved disputes
										break;

									case EscrowStatus.Completed: // 4
										// Check if payment was already released via Nostr event
										currentStatus = 'completed';
										if (latestNostrStatus !== 'payment-released') {
											// Only allow accept/dispute if payment hasn't been released yet
											canAccept = isClient;
											canDispute = isClient;
										}
										break;

									case EscrowStatus.Cancelled: // 5
										currentStatus = 'cancelled';
										// No actions available for cancelled contracts
										break;
								}
							} else {
								// Fallback to Nostr status if RSK data unavailable
								console.warn('RSK escrow data unavailable, falling back to Nostr status');

								// Use Nostr status with basic action logic
								if (latestNostrStatus === 'payment-released') {
									currentStatus = 'resolved';
									// No actions available when payment is released
								} else {
									canComplete = isFreelancer && currentStatus === 'active' && latestNostrStatus !== 'task-completed';
									canAccept = isClient && currentStatus === 'completed' && latestNostrStatus !== 'payment-released';
									canDispute = isClient && currentStatus === 'completed' && latestNostrStatus !== 'payment-released';
									canPropose = isFreelancer && currentStatus === 'disputed';
									canAcceptProposal = isClient && currentStatus === 'disputed';
									canCancel = currentStatus === 'active';
									canResolveTimelock = currentStatus === 'disputed';
								}
							}
						} catch (error) {
							// If RSK check fails, fall back to Nostr status
							console.warn('Failed to check RSK contract state, using Nostr status:', error);

							// Use Nostr status with basic action logic
							if (latestNostrStatus === 'payment-released') {
								currentStatus = 'resolved';
								// No actions available when payment is released
							} else {
								canComplete = isFreelancer && currentStatus === 'active' && latestNostrStatus !== 'task-completed';
								canAccept = isClient && currentStatus === 'completed' && latestNostrStatus !== 'payment-released';
								canDispute = isClient && currentStatus === 'completed' && latestNostrStatus !== 'payment-released';
								canPropose = isFreelancer && currentStatus === 'disputed';
								canAcceptProposal = isClient && currentStatus === 'disputed';
								canCancel = currentStatus === 'active';
								canResolveTimelock = currentStatus === 'disputed';
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