import type { BidStatusEnum } from './enums/bid.enum';
import type { Filter, NostrEvent } from 'nostr-tools';
import type { NostrBidStatus } from '$lib/types/bid';
import type { PaymentAsset, PaymentNetwork } from '$lib/utils/helpers/paymentContext';
import { getNpub, getNostrKeyPair } from '$lib/utils/nostrKeys';
import { queryNostrEvents, publishNostrEvent } from '$lib/utils/nostr';
import { TAG_FILTERS, TAG_PATTERNS } from '$lib/utils/constants/tags';
import { smartCache, currencyCache } from '$lib/utils/cache/bid-cache';
import { appStore } from '$lib/stores/app.store';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { nip19, nip44 } from 'nostr-tools';
import { bidStore } from '$lib/stores/bid.store';
import KINDS from '$lib/utils/constants/kinds';
import {
	STATUS_SCHEMA_VERSION,
	getBidReference,
	getTaskReference,
	normalizePaymentAsset,
	normalizePaymentContext,
	normalizePaymentNetwork
} from '$lib/utils/helpers/paymentContext';


/**
 * Clear bid cache (call this when bids are created, updated, or deleted)
 * 
 * @param taskId - Optional task ID to clear only that task's bid cache
 */
export function clearBidCache(taskId?: string): void {
	if (taskId) {
		// Clear the specific task's bid cache and all user bid caches
		// since a change in a task's bid affects both the task view and the user's submitted bids view
		smartCache.invalidateTaskBids(taskId);
		smartCache.clearUserBids();
		if (import.meta.env.DEV) {
			console.debug(`Cleared bid cache for task: ${taskId} and all user bids`);
		}
	} else {
		// Clear all bid caches if no specific ID provided
		smartCache.clearBids();
		if (import.meta.env.DEV) {
			console.debug('Cleared all bid caches');
		}
	}
	// Currency cache doesn't need to be cleared unless BTC price changes
	// currencyCache.clear();
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
 * Filter out NIP-09 deleted events from a list of Nostr events.
 * Fetches kind 5 (deletion) events from the given authors and excludes any
 * event whose ID is referenced in a deletion. Required because relays MAY
 * not honor NIP-09 - clients MUST filter client-side per spec.
 *
 * @param events - Events to filter (e.g. bids)
 * @returns Events with deleted ones removed
 */
async function filterNip09DeletedEvents(events: NostrEvent[]): Promise<NostrEvent[]> {
	if (events.length === 0) return events;

	const authors = [...new Set(events.map((e) => e.pubkey))];
	const deletionFilter: Filter = {
		kinds: [5],
		authors,
		limit: 500
	};

	const deletions = await queryNostrEvents(deletionFilter);
	const deletedIds = new Set<string>();

	for (const d of deletions) {
		for (const tag of d.tags) {
			if (tag[0] === 'e' && tag[1]) {
				deletedIds.add(tag[1]);
			}
		}
	}

	return events.filter((e) => !deletedIds.has(e.id));
}

/**
 * Get all bids for a specific task using optimized tag-based filtering
 * 
 * This function uses custom event kinds (KINDS.BIDS) and tag-based relay filtering
 * to efficiently retrieve bids without fetching all conversations.
 * 
 * Performance optimizations:
 * - Fetches ONLY bid events (~100 events)
 * - NO calls to getMessagedPeople()
 * - NO fetching of regular chat messages
 * - Relay-side filtering by task ID
 * - Single-pass status attachment during decryption (no separate iterations)
 * 
 * @param taskId - Task ID to get bids for
 * @param includeStatus - Whether to query and attach the latest bid status events (default: true)
 * @returns Array of bid messages with their associated status data attached
 */
export async function getBidsForTask(taskId: string, includeStatus: boolean = true): Promise<NostrEvent[]> {
	try {
		// Check smartCache first
		const cachedBids = smartCache.getBidsForTask(taskId);
		if (cachedBids) {
			if (import.meta.env.DEV) {
				console.debug('Using cached task bid data');
			}
			return cachedBids;
		}

		let npub = await getNpub();
		if (npub.startsWith('npub')) {
			const { nip19 } = await import('nostr-tools');
			npub = nip19.decode(npub).data as string;
		}

		// Query bid events with relay-side filtering
		const filter: Filter = {
			kinds: [KINDS.BIDS],
			...TAG_FILTERS.byTask(taskId), // Filter by task ID
			...TAG_FILTERS.byNpub(npub), // Filter by recipient (user)
			limit: 100
		};

		// Prepare followup filter for bid status events if requested
		const followupFilter = includeStatus ? {
			kinds: [KINDS.BID_STATUS],
			...TAG_FILTERS.byTask(taskId),
			limit: 500 // Allow multiple status updates per bid
		} : undefined;

		// Query bids with optional status followup
		// Status events are automatically linked by parent bid event ID via #e tag
		let bids = await queryNostrEvents(
			filter,
			followupFilter,
			followupFilter ? {
				attachAs: 'latestStatus', // Attach as 'latestStatus' property
				keepLatest: true          // Only keep the most recent status per bid
			} : undefined
		);

		// Filter out NIP-09 deleted bids (client-side filtering; relays may not honor deletion)
		bids = await filterNip09DeletedEvents(bids);

		// Cache the results
		smartCache.setBidsForTask(taskId, bids, 5);

		return bids;
	} catch (error) {
		console.warn('Error getting bids for task:', error);
		throw error;
	}
}


/**
 * Get all bids sent by the current user using optimized tag-based filtering
 * 
 * Uses KINDS.BIDS with author filter for efficient retrieval.
 * Status events are automatically attached during the decryption loop for better performance.
 * 
 * @param includeStatus - Whether to query and attach the latest bid status events (default: true)
 * @returns Array of bid messages with their associated status data attached
 */
export async function getMyBids(includeStatus: boolean = true): Promise<NostrEvent[]> {
	try {
		let npub = await getNpub();
		if (npub.startsWith('npub')) {
			const { nip19 } = await import('nostr-tools');
			npub = nip19.decode(npub).data as string;
		}

		// Check smartCache first
		const cachedBids = smartCache.getBidsByUser(npub);
		if (cachedBids) {
			if (import.meta.env.DEV) {
				console.debug('Using cached my bids data');
			}
			return cachedBids;
		}

		// Query bid events directly where user is the author
		const filter: Filter = {
			kinds: [KINDS.BIDS],
			authors: [npub],
			limit: 500
		};

		// Prepare followup filter for bid status events if requested
		const followupFilter = includeStatus ? {
			kinds: [KINDS.BID_STATUS],
			...TAG_FILTERS.byNpub(npub), // Status events sent to the bidder (current user)
			limit: 500
		} : undefined;

		// Query bids with optional status followup
		// Status events are automatically linked by parent bid event ID via #e tag
		let bids = await queryNostrEvents(
			filter,
			followupFilter,
			followupFilter ? {
				attachAs: 'latestStatus', // Attach as 'latestStatus' property
				keepLatest: true          // Only keep the most recent status per bid
			} : undefined
		);

		// Filter out NIP-09 deleted bids (client-side filtering; relays may not honor deletion)
		bids = await filterNip09DeletedEvents(bids);

		// Cache the results
		smartCache.setBidsByUser(npub, bids, 5);

		return bids;
	} catch (error) {
		console.warn('Error getting my bids:', error);
		return [];
	}
}

/**
 * Extract the latest bid status from a bid event
 * 
 * @param bidEvent - Bid event that may have a latestStatus property attached
 * @returns The bid status or null if no status exists
 */
export function getBidStatus(bidEvent: NostrEvent): NostrBidStatus | null {
	const latestStatus = (bidEvent as any).latestStatus;

	if (!latestStatus) {
		return null;
	}

	try {
		const content = latestStatus.content as unknown as NostrBidStatus;
		return normalizeBidStatusContent(content, latestStatus.tags, bidEvent.id);
	} catch (error) {
		console.warn('Failed to parse bid status:', error);
		return null;
	}
}

export function normalizeBidStatusContent(
	status: NostrBidStatus,
	tags: string[][] = [],
	parentBidEventId?: string
): NostrBidStatus {
	const taskId = status.taskId || tags.find((tag) => tag[0] === 't')?.[1] || '';
	const taggedNetwork = status.paymentNetwork ?? tags.find((tag) => tag[0] === 'n')?.[1];
	const inferredAsset =
		status.paymentAsset ?? (taggedNetwork?.startsWith('bsc') ? 'USDT' : 'RBTC');
	const paymentAsset = normalizePaymentAsset(inferredAsset);
	const paymentNetwork = normalizePaymentNetwork(
		taggedNetwork,
		paymentAsset
	);
	const normalized = normalizePaymentContext(
		{
			...status,
			taskId,
			taskRef: status.taskRef || (taskId ? getTaskReference(taskId) : undefined),
			bidRef: status.bidRef || (parentBidEventId ? getBidReference(parentBidEventId) : undefined),
			paymentAsset,
			paymentNetwork
		},
		STATUS_SCHEMA_VERSION,
		paymentAsset
	);

	return normalized;
}

async function resolveBidStatusWriteContext(
	bidEventId: string,
	taskId: string,
	options?: {
		taskRef?: string;
		bidRef?: string;
		paymentAsset?: PaymentAsset;
		paymentNetwork?: PaymentNetwork;
	}
): Promise<{
	taskRef?: string;
	bidRef?: string;
	paymentAsset?: PaymentAsset;
	paymentNetwork?: PaymentNetwork;
}> {
	if (options?.taskRef && options?.bidRef && options?.paymentAsset && options?.paymentNetwork) {
		const paymentAsset = normalizePaymentAsset(options.paymentAsset);
		return {
			taskRef: options.taskRef,
			bidRef: options.bidRef,
			paymentAsset,
			paymentNetwork: normalizePaymentNetwork(options.paymentNetwork, paymentAsset)
		};
	}

	try {
		const bidEvents = await queryNostrEvents({
			kinds: [KINDS.BIDS],
			ids: [bidEventId],
			limit: 1
		});
		const bidEvent = Array.isArray(bidEvents) ? bidEvents[0] : undefined;

		if (bidEvent && typeof bidEvent.content === 'object' && bidEvent.content !== null) {
			const bidContent = bidEvent.content as Record<string, unknown>;
			const paymentAsset = bidContent.paymentAsset
				? normalizePaymentAsset(bidContent.paymentAsset as string)
				: typeof bidContent.paymentNetwork === 'string' &&
					(bidContent.paymentNetwork as string).startsWith('bsc')
					? 'USDT'
				: undefined;

			return {
				taskRef:
					options?.taskRef ??
					(typeof bidContent.taskRef === 'string' ? bidContent.taskRef : undefined) ??
					getTaskReference(taskId),
				bidRef:
					options?.bidRef ??
					(typeof bidContent.bidRef === 'string' ? bidContent.bidRef : undefined) ??
					getBidReference(bidEventId),
				paymentAsset: paymentAsset ?? options?.paymentAsset,
				paymentNetwork:
					options?.paymentNetwork ??
					(typeof bidContent.paymentNetwork === 'string'
						? normalizePaymentNetwork(bidContent.paymentNetwork, paymentAsset ?? 'RBTC')
						: undefined)
			};
		}
	} catch (error) {
		console.warn('Failed to load bid metadata for bid status update:', error);
	}

	return {
		taskRef: options?.taskRef ?? getTaskReference(taskId),
		bidRef: options?.bidRef ?? getBidReference(bidEventId),
		paymentAsset: options?.paymentAsset
			? normalizePaymentAsset(options.paymentAsset)
			: options?.paymentNetwork?.startsWith('bsc')
				? 'USDT'
				: undefined,
		paymentNetwork:
			options?.paymentNetwork &&
			normalizePaymentNetwork(
				options.paymentNetwork,
				options?.paymentAsset ? normalizePaymentAsset(options.paymentAsset) : 'RBTC'
			)
	};
}

/**
 * Decrypt a single bid event
 * Used for real-time subscription updates to avoid re-fetching all bids
 * 
 * @param event - The encrypted bid event from subscription
 * @returns Decrypted bid event or null if decryption fails
 */
export async function decryptBidEvent(event: NostrEvent): Promise<NostrEvent | null> {
	try {
		let { npub, nsec } = await getNostrKeyPair();
		if (!npub || !nsec) {
			throw new Error('No keys found');
		}

		if (npub.startsWith('npub')) {
			npub = nip19.decode(npub).data as string;
		}

		// Determine the other party's pubkey for decryption
		let otherPubkey: string;

		if (event.pubkey === npub) {
			// We are the sender, decrypt with recipient's key
			const recipientTag = event.tags.find((tag) => tag[0] === 'p');
			if (!recipientTag || !recipientTag[1]) {
				console.warn('No recipient found in bid event tags:', event.id);
				return null;
			}
			otherPubkey = recipientTag[1];
		} else {
			// We are the recipient, decrypt with sender's key
			otherPubkey = event.pubkey;
		}

		// Get conversation key and decrypt
		const conversationKey = await nip44.getConversationKey(nsec, otherPubkey);
		const decryptedContent = nip44.decrypt(event.content, conversationKey);
		const parsedContent = JSON.parse(decryptedContent);

		return {
			...event,
			content: parsedContent
		};
	} catch (error) {
		if (error instanceof Error && !error.message.includes('Invalid MAC')) {
			console.error('Failed to decrypt bid event:', event.id, error);
		}
		return null;
	}
}

/**
 * Send a bid status update (acceptance or rejection) via encrypted DM
 */
export async function sendBidStatusUpdate(
	bidEventId: string,
	taskId: string,
	bidderPubkey: string,
	status: BidStatusEnum,
	message?: string,
	escrowId?: string,
	transactionHash?: string,
	options?: {
		taskRef?: string;
		bidRef?: string;
		paymentAsset?: PaymentAsset;
		paymentNetwork?: PaymentNetwork;
	}
): Promise<void> {
	try {
		const { taskRef, bidRef, paymentAsset, paymentNetwork } = await resolveBidStatusWriteContext(
			bidEventId,
			taskId,
			options
		);
		const statusData = normalizeBidStatusContent({
			type: 'bid-status',
			schemaVersion: STATUS_SCHEMA_VERSION,
			taskId,
			taskRef,
			bidRef,
			status,
			message,
			timestamp: Date.now(),
			paymentAsset,
			paymentNetwork,
			escrowId,
			transactionHash
		}, [], bidEventId);

		// Send as encrypted DM to the bidder
		const statusMessage = JSON.stringify(statusData);
		const tags = TAG_PATTERNS.bidStatus(bidEventId, taskId, status, bidderPubkey, {
			paymentNetwork,
			schemaVersion: STATUS_SCHEMA_VERSION
		});
		await publishNostrEvent(KINDS.BID_STATUS, statusMessage, bidderPubkey, tags);

		// Clear bid cache for this specific task and bidder to ensure fresh data
		// This is more efficient than clearing all caches
		clearBidCache(taskId);
		
		bidStore.removeProcessingBid(bidEventId);
		appStore.showInfoToast(`Bid status updated to ${status}`);
	} catch (error) {
		// Log error but don't throw - allow UI to continue
		console.warn('Error sending bid status update:', error);
		// Ensure cleanup happens even if sending status update fails
		// This prevents bid from being stuck in processing state
		bidStore.removeProcessingBid(bidEventId);
		// Don't throw - let the caller handle the error if needed
		// The UI should show a warning but not break
	}
}
