import { BidStatusEnum } from './enums/bid.enum';
import type { Filter, NostrEvent } from 'nostr-tools';
import type {
	LockedBidCurrency,
	NostrBidContent,
	NostrBidStatus,
	NostrEventWithFollowup
} from '$lib/types/bid';
import { getNpub, getNostrKeyPair } from '$lib/utils/nostrKeys';
import { queryNostrEvents, publishNostrEvent } from '$lib/utils/nostr';
import { TAG_FILTERS, TAG_PATTERNS } from '$lib/utils/constants/tags';
import { smartCache, currencyCache } from '$lib/utils/cache/bid-cache';
import { appStore } from '$lib/stores/app.store';
import { muteStore } from '$lib/stores/mute.store';
import { get } from 'svelte/store';
import { nip19, nip44 } from 'nostr-tools';
import { bidStore } from '$lib/stores/bid.store';
import KINDS from '$lib/utils/constants/kinds';
import { resolveSharedRelays } from '$lib/utils/relayUrls';
import { isEscrowBolt11, isRgbInvoice } from '$lib/services/rgb/escrow-rail';

const BID_RELAYS = resolveSharedRelays();

const SATS_CURRENCY_CODES = new Set(['SATS', 'SAT', 'BTC']);

/** True when the stored quote is a sat amount. Missing currency is a legacy sat bid. */
export function isSatBid(currency: string | undefined): boolean {
	const code = (currency ?? 'SATS').trim().toUpperCase();
	return SATS_CURRENCY_CODES.has(code);
}

export function lockBidAmount(
	amount: number,
	currency: string | undefined
): { lockedAmount: number; lockedCurrency: LockedBidCurrency } | null {
	if (!Number.isFinite(amount) || amount <= 0) return null;
	if (isSatBid(currency)) {
		return { lockedAmount: Math.max(1, Math.round(amount)), lockedCurrency: 'SATS' };
	}
	return { lockedAmount: amount, lockedCurrency: 'USD' };
}

export function resolveBidSats(
	amount: number,
	currency: string | undefined,
	btcUsdPrice: number
): number | null {
	if (!Number.isFinite(amount) || amount <= 0) return null;
	const code = (currency ?? 'SATS').trim().toUpperCase();
	if (SATS_CURRENCY_CODES.has(code)) return Math.max(1, Math.round(amount));
	if (btcUsdPrice > 0) return Math.max(1, Math.round((amount / btcUsdPrice) * 100_000_000));
	return null;
}

export interface PublishBidParams {
	taskId: string;
	taskEventId: string;
	taskDTag: string;
	taskTitle: string;
	taskDescription: string;
	taskBudget?: { amount: number; currency?: string };
	taskCreatorPubkey: string;
	amount: number;
	days: number;
	proposal: string;
}

export function buildBidContent(
	params: PublishBidParams,
	bidderId: string,
	now: number
): NostrBidContent {
	const bidderHex = pubkeyToHex(bidderId);
	const bidId = `${params.taskDTag}-${bidderHex}`;
	return {
		type: 'bid',
		taskId: params.taskDTag,
		taskTitle: params.taskTitle,
		taskDescription: params.taskDescription,
		taskBudget: params.taskBudget,
		amount: params.amount,
		currency: 'USD',
		paymentType: 'FIXED',
		description: params.proposal,
		estimatedDuration: `${params.days} days`,
		proposedApproach: params.proposal,
		coverLetter: params.proposal,
		timestamp: now,
		bidId,
		startDateTime: now,
		endDateTime: now + params.days * 24 * 60 * 60,
		bidderId,
		taskCreatorPubkey: params.taskCreatorPubkey
	};
}

/** Tasker hex from bid content, or from the bid's `p` tag when older bids omitted it. */
export function readTaskerPubkey(event: NostrEvent): string {
	const content = event.content as unknown;
	if (content && typeof content === 'object' && 'taskCreatorPubkey' in content) {
		const stored = (content as { taskCreatorPubkey?: unknown }).taskCreatorPubkey;
		if (typeof stored === 'string' && stored.trim()) return stored.trim();
	}
	const tagged = event.tags.find((tag) => tag[0] === 'p' && tag[1]?.trim());
	return tagged?.[1]?.trim() ?? '';
}

type LastPublishedBid = {
	bidEventId: string;
	bidderHex: string;
	taskEventId: string;
	taskDTag: string;
};

function pubkeyToHex(pubkey: string): string {
	if (/^[0-9a-f]{64}$/i.test(pubkey)) return pubkey.toLowerCase();
	const decoded = nip19.decode(pubkey);
	if (decoded.type !== 'npub')
		throw new Error(`Expected npub public key, received ${decoded.type}`);
	return decoded.data as string;
}

function exposeLastPublishedBid(event: NostrEvent, params: PublishBidParams): void {
	if (!import.meta.env.DEV && import.meta.env.VITE_E2E_TURNSTILE_BYPASS !== 'true') return;
	if (typeof window === 'undefined') return;

	(window as Window & { __lastPublishedBid?: LastPublishedBid }).__lastPublishedBid = {
		bidEventId: event.id,
		bidderHex: event.pubkey,
		taskEventId: params.taskEventId,
		taskDTag: params.taskDTag
	};
}

export async function publishBid(params: PublishBidParams): Promise<NostrEvent> {
	const now = Math.floor(Date.now() / 1000);
	const bidderId = await getNpub();
	const content = buildBidContent(params, bidderId, now);
	const bidId = content.bidId;

	const result = await publishNostrEvent(
		KINDS.BIDS,
		JSON.stringify(content),
		params.taskCreatorPubkey,
		[
			...TAG_PATTERNS.bid(bidId, params.taskDTag, params.taskCreatorPubkey, 'FIXED'),
			['e', params.taskEventId]
		],
		BID_RELAYS
	);

	await confirmBidEvent(result.event);
	exposeLastPublishedBid(result.event, params);
	clearBidCache(params.taskDTag);
	return result.event;
}

function publishedId(saved: unknown): string {
	if (!saved || typeof saved !== 'object') return '';
	const row = saved as { id?: unknown; data?: unknown };
	if (typeof row.id === 'string') return row.id;
	if (!row.data || typeof row.data !== 'object') return '';
	const nested = (row.data as { id?: unknown }).id;
	return typeof nested === 'string' ? nested : '';
}

/** The bid toast waits on this. A relay write alone is not confirmation. */
export async function confirmBidEvent(event: NostrEvent): Promise<void> {
	const { default: events } = await import('$lib/api/services/nostr/events');
	const saved = await events.publishEvent(event);
	const id = publishedId(saved);
	if (!id || id !== event.id) throw new Error('Bid was not confirmed');
}

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
async function filterNip09DeletedEvents(
	events: NostrEvent[],
	relays: string[]
): Promise<NostrEvent[]> {
	if (events.length === 0) return events;

	const authors = [...new Set(events.map((e) => e.pubkey))];
	const deletionFilter: Filter = {
		kinds: [5],
		authors,
		limit: 500
	};

	const deletions = await queryNostrEvents(deletionFilter, undefined, undefined, relays);
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
export async function getBidsForTask(
	taskId: string,
	includeStatus: boolean = true,
	allStatuses: boolean = false
): Promise<NostrEvent[]> {
	try {
		// The invoice lookup needs every status. The shared cache only stores the latest one.
		const cachedBids = allStatuses ? undefined : smartCache.getBidsForTask(taskId);
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
		const followupFilter = includeStatus
			? {
					kinds: [KINDS.BID_STATUS],
					...TAG_FILTERS.byTask(taskId),
					limit: 500 // Allow multiple status updates per bid
				}
			: undefined;

		// Query bids with optional status followup
		// Status events are automatically linked by parent bid event ID via #e tag
		let bids = await queryNostrEvents(
			filter,
			followupFilter,
			followupFilter
				? {
						attachAs: 'latestStatus',
						keepLatest: !allStatuses
					}
				: undefined,
			BID_RELAYS
		);

		// Filter out NIP-09 deleted bids (client-side filtering; relays may not honor deletion)
		bids = await filterNip09DeletedEvents(bids, BID_RELAYS);

		// Filter out bids from muted users — applied before caching so cache stays clean.
		const currentMutes = get(muteStore);
		if (currentMutes.mutedPubkeys.size > 0) {
			bids = bids.filter((bid) => !currentMutes.mutedPubkeys.has(bid.pubkey));
		}

		if (!allStatuses) smartCache.setBidsForTask(taskId, bids, 5);

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
		const followupFilter = includeStatus
			? {
					kinds: [KINDS.BID_STATUS],
					...TAG_FILTERS.byNpub(npub), // Status events sent to the bidder (current user)
					limit: 500
				}
			: undefined;

		// Query bids with optional status followup
		// Status events are automatically linked by parent bid event ID via #e tag
		let bids = await queryNostrEvents(
			filter,
			followupFilter,
			followupFilter
				? {
						attachAs: 'latestStatus', // Attach as 'latestStatus' property
						keepLatest: true // Only keep the most recent status per bid
					}
				: undefined,
			BID_RELAYS
		);

		// Filter out NIP-09 deleted bids (client-side filtering; relays may not honor deletion)
		bids = await filterNip09DeletedEvents(bids, BID_RELAYS);

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
export function getBidStatus(bidEvent: NostrEventWithFollowup): NostrBidStatus | null {
	const latestStatus = bidEvent.latestStatus;

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
 * Decrypt a single bid event
 * Used for real-time subscription updates to avoid re-fetching all bids
 *
 * @param event - The encrypted bid event from subscription
 * @returns Decrypted bid event or null if decryption fails
 */
export async function decryptBidEvent(event: NostrEvent): Promise<NostrEvent | null> {
	try {
		const keyPair = await getNostrKeyPair();
		const { nsec } = keyPair;
		let { npub } = keyPair;
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
 * Send a bid status update (acceptance or rejection) via encrypted DM.
 * Returns `true` on success, `false` on failure. Never throws.
 */
export function readFundingInvoice(status: NostrBidStatus | null): string | undefined {
	const invoice = status?.invoice?.trim() ?? '';
	if (!isRgbInvoice(invoice) && !isEscrowBolt11(invoice)) return undefined;
	return invoice;
}

function statusTimestamp(status: NostrBidStatus, createdAt: number): number {
	return typeof status.timestamp === 'number' ? status.timestamp : createdAt;
}

/** Newest RGB invoice on the bid, including one hidden by a later status. */
export function readBidInvoice(event: { latestStatus?: unknown }): string | undefined {
	const attached = event.latestStatus;
	const events = Array.isArray(attached) ? attached : attached ? [attached] : [];
	let chosen: { invoice: string; at: number } | undefined;
	for (const statusEvent of events) {
		if (!statusEvent || typeof statusEvent !== 'object') continue;
		const record = statusEvent as { content?: unknown; created_at?: number };
		const content = record.content;
		if (!content || typeof content !== 'object') continue;
		const status = content as NostrBidStatus;
		const invoice = readFundingInvoice(status);
		if (!invoice) continue;
		const at = statusTimestamp(status, record.created_at ?? 0);
		if (!chosen || at >= chosen.at) chosen = { invoice, at };
	}
	return chosen?.invoice;
}

/** Latest blank invoice the Taskee published for this bid. */
export async function fetchFundingInvoice(
	taskId: string,
	bidId: string
): Promise<string | undefined> {
	clearBidCache(taskId);
	const bids = await getBidsForTask(taskId, true, true);
	const match = bids.find((event) => event.id === bidId);
	if (!match) return undefined;
	return readBidInvoice(match as NostrEventWithFollowup);
}

/** Taskee hands a blank RGB invoice to the Tasker. Status stays accepted. */
export async function publishFundingInvoice(
	bidEventId: string,
	taskId: string,
	taskerPubkey: string,
	invoice: string
): Promise<boolean> {
	const trimmed = invoice.trim();
	if (!isRgbInvoice(trimmed) && !isEscrowBolt11(trimmed)) {
		throw new Error('Escrow invoice must be an rgb or lightning invoice');
	}
	const tasker = taskerPubkey.trim();
	if (!tasker) return false;
	return sendBidStatusUpdate(
		bidEventId,
		taskId,
		tasker,
		BidStatusEnum.ACCEPTED,
		'Escrow invoice created',
		undefined,
		undefined,
		trimmed
	);
}

export async function sendBidStatusUpdate(
	bidEventId: string,
	taskId: string,
	bidderPubkey: string,
	status: BidStatusEnum,
	message?: string,
	escrowId?: string,
	transactionHash?: string,
	invoice?: string
): Promise<boolean> {
	try {
		const statusData: NostrBidStatus = {
			type: 'bid-status',
			taskId,
			status,
			message,
			timestamp: Date.now(),
			escrowId,
			transactionHash,
			...(invoice ? { invoice } : {})
		};

		// Send as encrypted DM to the bidder
		const statusMessage = JSON.stringify(statusData);
		const tags = TAG_PATTERNS.bidStatus(bidEventId, taskId, status, bidderPubkey);
		await publishNostrEvent(KINDS.BID_STATUS, statusMessage, bidderPubkey, tags, BID_RELAYS);

		// Clear bid cache for this specific task and bidder to ensure fresh data
		// This is more efficient than clearing all caches
		clearBidCache(taskId);

		if (!invoice) appStore.showInfoToast(`Bid status updated to ${status}`);
		return true;
	} catch (error) {
		console.warn('Error sending bid status update:', error);
		return false;
	} finally {
		// Always clean up processing state — even on failure
		bidStore.removeProcessingBid(bidEventId);
	}
}
