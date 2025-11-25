/**
 * Standardized Single-Character Nostr Tags for BitTasker
 * 
 * Following Nostr best practices, all custom tags use single characters.
 * This improves relay filtering performance and reduces event size.
 * 
 * Standard Nostr tags: https://github.com/nostr-protocol/nips/blob/master/01.md
 */

import type { EscrowStatus } from "../enums/wallet.enum";

export const TAGS = {
	// ============================================================================
	// STANDARD NOSTR TAGS (NIP-01)
	// ============================================================================

	/** Pubkey reference - references another user's public key */
	P: 'p' as const,

	/** Event reference - references another event by ID */
	E: 'e' as const,

	/** Identifier - unique identifier for parameterized replaceable events (30000-39999) */
	D: 'd' as const,

	/** Reply marker - marks event as a reply to another event */
	R: 'r' as const,

	// ============================================================================
	// CUSTOM BITTASKER TAGS
	// ============================================================================

	/** Task ID reference - links events to specific tasks */
	T: 't' as const,

	/** Bid ID reference - links events to specific bids */
	B: 'b' as const,

	/** Status - current status of bid/contract (pending, accepted, completed, etc.) */
	S: 's' as const,

	/** Message type - identifies the type of message (bid, contract, bid-status, etc.) */
	M: 'm' as const,

	/** Contract action - specific action on contract (creation, update, completion, etc.) */
	C: 'c' as const,

	/** Amount - monetary amount (when needed as queryable metadata) */
	A: 'a' as const,

	/** Payment type - FIXED or HOURLY */
	Y: 'y' as const,
} as const;

/**
 * Type helper for tag arrays
 * Ensures type safety when creating Nostr event tags
 */
export type NostrTag = readonly [string, string, ...string[]];

/**
 * Common tag patterns for BitTasker events
 */
export const TAG_PATTERNS = {
	/**
	 * Bid submission tags
	 * @param bidId - Unique bid identifier
	 * @param taskId - Task being bid on
	 * @param taskCreatorPubkey - Task creator's public key
	 * @param paymentType - FIXED or HOURLY
	 */
	bid: (bidId: string, taskId: string, taskCreatorPubkey: string, paymentType: string, status: string = 'pending'): string[][] => [
		[TAGS.D, bidId], // Unique identifier (replaceable) // TODO: Useless generated bid id that should be removed in fovor of nostr event id
		[TAGS.T, taskId], // Task reference
		[TAGS.P, taskCreatorPubkey], // Recipient
		[TAGS.S, status], // Status
		[TAGS.M, 'bid'], // Message type
		[TAGS.Y, paymentType] // Payment type (FIXED/HOURLY)
	],

	/**
	 * Bid status update tags
	 * @param bidId - Bid being updated
	 * @param taskId - Associated task
	 * @param status - New status (accepted, rejected)
	 */
	bidStatus: (bidEventId: string, taskId: string, status: string, recepientPub: string): string[][] => [
		[TAGS.E, bidEventId], // Event reference
		[TAGS.P, recepientPub], // Recipient
		[TAGS.T, taskId], // Task reference
		[TAGS.S, status], // Status
		[TAGS.M, 'bid-status'] // Message type
	],

	/**
	 * Contract creation tags
	 * @param escrowId - Unique escrow/contract identifier
	 * @param taskId - Associated task
	 * @param freelancerPubkey - Freelancer's public key
	 * @param clientPubkey - Client's public key
	 */
	contract: (
		escrowId: string,
		taskId: string,
		freelancerPubkey: string,
		clientPubkey: string,
		status: string = 'active'
	): string[][] => [
			[TAGS.D, escrowId], // Unique identifier
			[TAGS.T, taskId], // Task reference
			[TAGS.P, freelancerPubkey], // Participant
			[TAGS.P, clientPubkey], // Participant (can have multiple)
			[TAGS.S, status], // Status
			[TAGS.M, 'contract'] // Message type
		],

	/**
	 * Contract status update tags
	 * @param contractEventId - Contract event being updated
	 * @param escrowId - Associated escrow
	 * @param recipientPubkey - Recipient of the update
	 * @param action - Status action
	 */
	contractStatus: (
		contractEventId: string,
		escrowId: string,
		recipientPubkey: string,
		action: EscrowStatus
	): string[][] => [
			[TAGS.E, contractEventId], // References contract
			[TAGS.R, escrowId], // Escrow reference
			[TAGS.P, recipientPubkey], // Recipient
			[TAGS.S, action?.toString()], // Status action
			[TAGS.M, 'contract-status'] // Message type
		],

	/**
	 * Direct message tags (minimal for privacy)
	 * @param recipientPubkey - Message recipient
	 */
	directMessage: (recipientPubkey: string): string[][] => [[TAGS.P, recipientPubkey]]
} as const;

/**
 * Tag filter helpers for querying events
 */
export const TAG_FILTERS = {
	/** Filter events by task ID */
	byTask: (taskId: string) => ({ [`#${TAGS.T}`]: [taskId] }),

	/** Filter events by bid ID */
	byBid: (bidId: string) => ({ [`#${TAGS.B}`]: [bidId] }),

	/** Filter events by status */
	byStatus: (status: string) => ({ [`#${TAGS.S}`]: [status] }),

	/** Filter events by message type */
	byMessageType: (type: string) => ({ [`#${TAGS.M}`]: [type] }),

	/** Filter events by pubkey (recipient or participant) */
	byNpub: (npub: string) => ({ [`#${TAGS.P}`]: [npub] }),

	/** Filter events by event reference */
	byEvent: (eventId: string) => ({ [`#${TAGS.E}`]: [eventId] }),

	/** Filter events by identifier (for parameterized replaceable) */
	byIdentifier: (identifier: string) => ({ [`#${TAGS.D}`]: [identifier] })
} as const;

export default TAGS;
