/**
 * Standardized Single-Character Nostr Tags for BitTasker
 * 
 * Following Nostr best practices, all custom tags use single characters.
 * This improves relay filtering performance and reduces event size.
 * 
 * Standard Nostr tags: https://github.com/nostr-protocol/nips/blob/master/01.md
 */

import type { EscrowStatus } from "../escrow";

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

	/** Reply marker - marks event as a reply to another event - Also used for escrow ID */
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

	/** Context-specific indexed value. Service quotes use it for canonical service identity. */
	A: 'a' as const,

	/** Payment type - FIXED or HOURLY */
	Y: 'y' as const,

	/** Network - blockchain network (mainnet, testnet) */
	N: 'n' as const,

	/** Location data - JSON-encoded location information */
	L: 'l' as const,

	/** Version - contract/escrow version (v1, v2, v3, etc.) */
	V: 'v' as const,

	/** Service-quote schema version */
	Z: 'z' as const,

	// Service listing tags (NIP-99 / findServices filters)
	/** Service location types (remote, tasker_location, etc.) */
	O: 'o' as const,

	/** Min price (service tiered pricing) */
	I: 'i' as const,

	/** Max price (service tiered pricing) */
	X: 'x' as const,

	/** Delivery time (hours) */
	U: 'u' as const,
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
	 * @param network - Blockchain network (mainnet, testnet)
	 */
	contract: (
		escrowId: string,
		taskId: string,
		freelancerPubkey: string,
		clientPubkey: string,
		network: string,
		version: string = 'v1',
		status: string = 'active'
	): string[][] => [
			[TAGS.D, escrowId], // Unique identifier
			[TAGS.T, taskId], // Task reference
			[TAGS.P, freelancerPubkey], // Participant
			[TAGS.P, clientPubkey], // Participant (can have multiple)
			[TAGS.N, network], // Network (mainnet/testnet)
			[TAGS.V, version], // Contract version (v1, v2, v3, etc.)
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
		action: EscrowStatus,
		version: string = 'v1'
	): string[][] => [
			[TAGS.E, contractEventId], // References contract
			[TAGS.R, escrowId], // Escrow reference
			[TAGS.P, recipientPubkey], // Recipient
			[TAGS.S, action?.toString()], // Status action
			[TAGS.V, version], // Contract version (v1, v2, v3, etc.)
			[TAGS.M, 'contract-status'] // Message type
		],

	/**
	 * Direct message tags (minimal for privacy)
	 * @param recipientPubkey - Message recipient
	 */
	directMessage: (recipientPubkey: string): string[][] => [
		[TAGS.P, recipientPubkey],
		[TAGS.M, 'direct-message']
	],

	/**
	 * Location message tags
	 * @param locationData - JSON-encoded location data
	 * @param taskId - Optional task ID reference
	 */
	location: (locationData: string, taskId?: string): string[][] => {
		const tags: string[][] = [
			[TAGS.M, 'location'], // Message type
			[TAGS.L, locationData] // Location data (JSON)
		];
		if (taskId) {
			tags.push([TAGS.T, taskId]); // Task reference
		}
		return tags;
	},

	/**
	 * Task completion message tags
	 * @param taskId - Task ID reference
	 * @param escrowId - Optional escrow ID reference
	 */
	taskCompletion: (taskId: string, escrowId?: string): string[][] => {
		const tags: string[][] = [
			[TAGS.M, 'task-completion'], // Message type
			[TAGS.T, taskId] // Task reference
		];
		if (escrowId) {
			tags.push([TAGS.R, escrowId]); // Escrow reference
		}
		return tags;
	},

	/**
	 * Payment released message tags (tasker notifies taskee that work was accepted and funds released)
	 * @param taskId - Task ID reference
	 */
	paymentReleased: (taskId: string): string[][] => [
		[TAGS.M, 'payment-released'], // Message type
		[TAGS.T, taskId] // Task reference
	]
} as const;

/**
 * Tag filter helpers for querying events
 */
export const TAG_FILTERS = {
	/** Filter events by task ID(s) */
	byTask: (taskId: string | string[]) => ({
		[`#${TAGS.T}`]: Array.isArray(taskId) ? taskId : [taskId]
	}),

	/** Filter events by bid ID */
	byBid: (bidId: string) => ({ [`#${TAGS.B}`]: [bidId] }),

	/** Filter events by status */
	byStatus: (status: string) => ({ [`#${TAGS.S}`]: [status] }),

	/** Filter events by multiple statuses */
	byStatuses: (statuses: string[]) => ({ [`#${TAGS.S}`]: statuses }),

	/** Filter events by message type */
	byMessageType: (type: string) => ({ [`#${TAGS.M}`]: [type] }),

	/** Filter events by pubkey (recipient or participant) */
	byNpub: (npub: string | string[]) => ({
		[`#${TAGS.P}`]: Array.isArray(npub) ? npub : [npub]
	}),

	/** Filter events by event reference */
	byEvent: (eventId: string) => ({ [`#${TAGS.E}`]: [eventId] }),

	/** Filter events by identifier (for parameterized replaceable) */
	byIdentifier: (identifier: string) => ({ [`#${TAGS.D}`]: [identifier] }),

	/** Filter events by network (mainnet, testnet) */
	byNetwork: (network: string) => ({ [`#${TAGS.N}`]: [network] }),

	/** Filter events by canonical service address */
	byServiceAddress: (serviceAddress: string | string[]) => ({
		[`#${TAGS.A}`]: Array.isArray(serviceAddress) ? serviceAddress : [serviceAddress]
	}),

	/** Filter events by version (v1, v2, v3, etc.) */
	byVersion: (version: string) => ({ [`#${TAGS.V}`]: [version] }),

	/** Filter events by schema version (service quotes) */
	bySchemaVersion: (version: string) => ({ [`#${TAGS.Z}`]: [version] }),

	/** Filter events by canonical service address */
	byAddress: (address: string | string[]) => ({
		[`#${TAGS.A}`]: Array.isArray(address) ? address : [address]
	}),

	/** Filter events by location data */
	byLocation: () => ({ [`#${TAGS.M}`]: ['location'] }),

	// Service listing filters (single-char tags, same as TAG_PATTERNS)
	/** Filter services by status (active, inactive, etc.) */
	byServiceStatus: (status: string[]) => ({ [`#${TAGS.S}`]: status }),

	/** Filter services by pricing type (FIXED, HOURLY, TIERED, etc.) */
	byServicePricingType: (pricingType: string) => ({ [`#${TAGS.Y}`]: [pricingType] }),

	/** Filter services by location types */
	byServiceLocationTypes: (types: string[]) => ({ [`#${TAGS.O}`]: types }),

	/** Filter services by min price */
	byServiceMinPrice: (minPrice: number) => ({ [`#${TAGS.I}`]: [minPrice.toString()] }),

	/** Filter services by max price */
	byServiceMaxPrice: (maxPrice: number) => ({ [`#${TAGS.X}`]: [maxPrice.toString()] }),

	/** Filter services by delivery time (hours) */
	byServiceDeliveryTime: (hours: number) => ({ [`#${TAGS.U}`]: [hours.toString()] }),
} as const;

export default TAGS;
