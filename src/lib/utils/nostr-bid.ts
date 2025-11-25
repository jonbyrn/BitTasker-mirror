import type { Filter, NostrEvent } from 'nostr-tools';
import type { NostrBidStatus } from '$lib/types/bid';
import { getNpub } from './nostrKeys';
import { queryNostrEvents, publishNostrEvent } from '$lib/utils/nostr';
import { TAG_FILTERS, TAG_PATTERNS } from '$lib/utils/constants/tags';
import { smartCache, currencyCache } from '$lib/utils/cache/bid-cache';
import KINDS from '$lib/utils/constants/kinds';
import { appStore } from '$lib/stores/app.store';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import type { BidStatusEnum } from './enums/bid.enum';


/**
 * Clear bid cache (call this when bids are created, updated, or deleted)
 * 
 * @param taskId - Optional task ID to clear only that task's bid cache
 */
export function clearBidCache(taskId?: string): void {
	if (taskId) {
		// Clear only the specific task's bid cache
		smartCache.invalidateTaskBids(taskId);
		if (import.meta.env.DEV) {
			console.debug(`Cleared bid cache for task: ${taskId}`);
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
		const bids = await queryNostrEvents(
			filter,
			followupFilter,
			followupFilter ? {
				attachAs: 'latestStatus', // Attach as 'latestStatus' property
				keepLatest: true          // Only keep the most recent status per bid
			} : undefined
		);

		// Cache the results
		smartCache.setBidsForTask(taskId, bids, 5);

		return bids;
	} catch (error) {
		console.warn('Error getting bids for task:', error);
		return [];
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
		const bids = await queryNostrEvents(
			filter,
			followupFilter,
			followupFilter ? {
				attachAs: 'latestStatus', // Attach as 'latestStatus' property
				keepLatest: true          // Only keep the most recent status per bid
			} : undefined
		);

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
		return latestStatus.content as unknown as NostrBidStatus;
	} catch (error) {
		console.warn('Failed to parse bid status:', error);
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
	transactionHash?: string
): Promise<void> {
	try {
		const statusData: NostrBidStatus = {
			type: 'bid-status',
			taskId,
			status,
			message,
			timestamp: Date.now(),
			escrowId,
			transactionHash
		};

		// Send as encrypted DM to the bidder
		const statusMessage = JSON.stringify(statusData);
		const tags = TAG_PATTERNS.bidStatus(bidEventId, taskId, status, bidderPubkey);
		await publishNostrEvent(KINDS.BID_STATUS, statusMessage, bidderPubkey, tags);

		// Clear bid cache for this specific task and bidder to ensure fresh data
		// This is more efficient than clearing all caches
		clearBidCache(taskId);

		pushNotificationService.sendNotificationToNpubs({
			npubs: [bidderPubkey],
			title: `Bid Status Updated - ${status}`,
			body: `Your bid has been ${status}`,
			type: 'bid_status_updated',
			clickAction: `${import.meta.env.VITE_APP_URL}/dashboard?tab=/bids`,
			icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
		})

		appStore.showInfoToast(`Bid status updated to ${status}`);
	} catch (error) {
		// Log error but don't throw - allow UI to continue
		console.warn('Error sending bid status update:', error);
		// Don't throw - let the caller handle the error if needed
		// The UI should show a warning but not break
	}
}
