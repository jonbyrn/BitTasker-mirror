import { type Event as NostrEvent, type Filter, nip19, nip44 } from 'nostr-tools';
import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
import { finalizeEvent, validateEvent, getPublicKey } from 'nostr-tools/pure';
import { appStore } from '$lib/stores/app.store';
import { get } from 'svelte/store';
import { hexToBytes } from '$lib/utils/helpers/encoding';
import KINDS from '$lib/utils/constants/kinds';
import nostrEventsService from '$lib/api/services/nostr/events';
import { queryRelayEvents } from '$lib/nostr/relayQuery';

// --- Relay Configuration ---

/**
 * Timeout for relay connectivity checks during preflight (in milliseconds).
 * This is a short timeout to quickly verify relay responsiveness.
 */
export const RELAY_CONNECTIVITY_TIMEOUT_MS = 3000; // 3 seconds for connectivity check

/**
 * Timeout for publishing events to relays (in milliseconds).
 * Increased from 5s to 15s to accommodate slower relays.
 */
export const PUBLISH_TIMEOUT_MS = 15000; // 15 seconds for publishing

/**
 * Ensures a relay URL is valid:
 * 1. Trims whitespace
 * 2. Ensures it starts with ws:// or wss://
 * 3. Handles potentially multiple URLs (comma separated)
 */
function sanitizeRelayUrls(input: string | string[] | undefined): string[] {
	if (!input) return [];

	const rawUrls = Array.isArray(input) ? input : input.split(',');

	return rawUrls
		.map((url) => url.trim())
		.filter((url) => {
			return (
				Boolean(url) &&
				url.length > 0 &&
				url !== 'undefined' &&
				url !== 'null' &&
				url !== '[object Object]'
			);
		})
		.map((url) => {
			if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
				return `wss://${url}`;
			}
			return url;
		});
}

const DEFAULT_RELAYS = sanitizeRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);
const POOL_QUERY_MS = 4000;

async function readPoolEvents(
	pool: { querySync: (relays: string[], filter: Filter) => Promise<NostrEvent[]> },
	relays: string[],
	filter: Filter
): Promise<NostrEvent[]> {
	const fromPool = await Promise.race([
		pool
			.querySync(relays, filter)
			.then((found) => ({ events: found, timedOut: false }))
			.catch(() => ({ events: [] as NostrEvent[], timedOut: true })),
		new Promise<{ events: NostrEvent[]; timedOut: true }>((resolve) => {
			setTimeout(() => resolve({ events: [], timedOut: true }), POOL_QUERY_MS);
		})
	]);
	if (!fromPool.timedOut) return fromPool.events;
	return (await queryRelayEvents(relays, filter)) as NostrEvent[];
}

/**
 * nostr-tools resolves a dead socket with the string "connection failure: …"
 * instead of rejecting. That string is not a relay OK.
 */
export function relayPublishError(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();
	if (text.toLowerCase().startsWith('connection failure:')) return text;
	return null;
}

function assertRelayOutcomes(outcomes: unknown): void {
	const values = Array.isArray(outcomes) ? outcomes : [outcomes];
	const errors = values
		.map((value) => relayPublishError(value))
		.filter((error): error is string => error !== null);
	if (errors.length > 0) throw new Error(errors.join('; '));
}

/** True when a relay still has this event. A publish OK is not enough. */
export async function findStoredEvent(eventId: string, relays: string[]): Promise<boolean> {
	if (!eventId || relays.length === 0) return false;
	const filter: Filter = { ids: [eventId] };
	const pool = getPool();
	const queried = pool.querySync(relays, filter).catch(() => [] as NostrEvent[]);
	const fromPool = await Promise.race([
		queried,
		new Promise<NostrEvent[]>((resolve) => setTimeout(() => resolve([]), POOL_QUERY_MS))
	]);
	if (fromPool.some((event) => event.id === eventId)) return true;
	const direct = await queryRelayEvents(relays, filter);
	return direct.some((event) => event.id === eventId);
}

// Determine if events need decryption based on event kinds
const encryptedKinds = [
	KINDS.DIRECT_MESSAGES,
	KINDS.BIDS,
	KINDS.CONTRACT,
	KINDS.CONTRACT_STATUS,
	KINDS.BID_STATUS,
	KINDS.SERVICE_QUOTE_REQUEST,
	KINDS.SERVICE_PROPOSAL,
	KINDS.SERVICE_PROPOSAL_STATUS
];

function isInvalidMacError(error: unknown): boolean {
	return error instanceof Error && /invalid mac/i.test(error.message);
}

function isE2ETest(): boolean {
	return (
		(typeof window !== 'undefined' &&
			(window as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ === true) ||
		import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true'
	);
}

function matchesLocalFilter(event: NostrEvent, filter: Filter): boolean {
	if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
	if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
	for (const [key, values] of Object.entries(filter)) {
		if (!key.startsWith('#') || !Array.isArray(values)) continue;
		if (!event.tags.some((tag) => tag[0] === key.slice(1) && values.includes(tag[1]))) {
			return false;
		}
	}
	return true;
}

/**
 * Get the centralized pool instance from appStore
 * This ensures we use a single pool across the entire application
 */
function getPool() {
	const pool = get(appStore)?.pool;
	if (!pool) {
		throw new Error('Pool not found');
	}
	return pool;
}

/**
 * Get a signed event using nostr-tools
 * @param metadata - The metadata for the event
 * @returns The signed event
 */
export async function getSignedEvent(metadata: Partial<NostrEvent>): Promise<NostrEvent> {
	const initialEvent = {
		created_at: metadata.created_at || Math.floor(Date.now() / 1000),
		kind: metadata.kind!,
		tags: [...(metadata.tags || []), ['v', __APP_VERSION__]],
		content: metadata.content || ''
	};

	const { npub, nsec } = await getNostrKeyPair();

	if (!npub || !nsec) {
		throw new Error('No pubkey or private key found');
	}

	const event = {
		...initialEvent,
		pubkey: npub
	};

	const signedEvent = finalizeEvent(event, nsec);

	if (!validateEvent(signedEvent)) {
		throw new Error('Invalid event');
	}

	return signedEvent;
}

/**
 * Publish an event to a relay
 * @param event - The event to publish
 * @param relayUrl - The URL of the relay to publish to
 */
export async function publishEvent(
	event: Partial<NostrEvent>,
	relayUrl: string = import.meta.env.VITE_NOSTR_RELAY_URL
): Promise<void> {
	try {
		const signedEvent = await getSignedEvent(event);
		const pool = getPool();

		// Publish the event using the pool
		const pub = pool.publish([relayUrl], signedEvent);

		// Wait for the publish to complete
		const outcomes = await Promise.race([
			Promise.all(pub),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Publish timeout')), PUBLISH_TIMEOUT_MS)
			)
		]);
		assertRelayOutcomes(outcomes);
	} catch (error) {
		console.error('Failed to publish event:', error);
		throw error;
	}
}

/**
 * Subscribe to Nostr events matching the given filters.
 * Used by review system and other features that need real-time or streaming queries.
 * @param relayUrl - Single relay URL (or first of DEFAULT_RELAYS if empty)
 * @param filters - Array of Nostr filters
 * @param onEvent - Callback for each matching event
 * @param onEose - Optional callback when subscription ends
 * @returns Unsubscribe function
 */
export function subscribeToEvents(
	relayUrl: string,
	filters: Filter[],
	onEvent: (event: NostrEvent) => void,
	onEose?: () => void
): () => void {
	const relays = relayUrl ? [relayUrl] : DEFAULT_RELAYS;
	if (relays.length === 0) {
		return () => {};
	}
	const pool = getPool();
	const filter = filters[0] ?? {};
	const sub = pool.subscribe(relays, filter, {
		onevent: onEvent,
		...(onEose && { oneose: onEose })
	});
	return () => sub.close();
}

// ================================================================
// NIP-44 helpers for encryption/decryption
// ================================================================

/**
 * Decode an encoded nsec to a Uint8Array
 * @param nsec - The encoded nsec
 * @returns The decoded nsec as a Uint8Array
 */
export function decodeNsec(nsec: string): Uint8Array<ArrayBufferLike> {
	try {
		if (!nsec.startsWith('nsec1')) {
			return hexToBytes(nsec);
		}
		const { data, type } = nip19.decode(nsec);
		if (type !== 'nsec') {
			throw new Error('Invalid nsec format');
		}
		return data as Uint8Array<ArrayBufferLike>;
	} catch {
		throw new Error('Invalid private key');
	}
}

/**
 * Get the npub from an encoded nsec
 * When the nsec is encoded, it's in bech32 format (nsec1...), so we need to decode it first
 * @param encodedNsec
 * @returns
 */
export function getNpubFromEncodedNsec(encodedNsec: string): string {
	// Decode the nsec
	const { data: privateKeyHex } = nip19.decode(encodedNsec);

	// Convert hex to bytes and then get public key
	const publicKeyHex = getPublicKey(privateKeyHex as Uint8Array);

	// Encode as npub
	const encodedNpub = nip19.npubEncode(publicKeyHex);

	return encodedNpub;
}

// --- Internal helpers ---
/**
 * Encrypt a message using NIP-44
 * @param plaintext - The plaintext message to encrypt
 * @param recipientNpub - The public key of the recipient
 * @returns The encrypted message
 */
async function encryptDM(
	nsec: Uint8Array,
	plaintext: string,
	recipientNpub: string
): Promise<string> {
	if (!nsec) {
		throw new Error('No private key found');
	}

	// Generate 32-byte nonce
	const nonce = crypto.getRandomValues(new Uint8Array(32));

	// Get conversation key
	const conversationKey = await nip44.getConversationKey(nsec, recipientNpub);

	// Encrypt with NIP-44
	return nip44.encrypt(plaintext, conversationKey, nonce);
}

/**
 * Decrypt a message using NIP-44
 * @param ciphertext - The encrypted message to decrypt
 * @param senderNpub - The public key of the sender
 * @returns The decrypted message
 */
export async function decryptDM(
	nsec: Uint8Array,
	ciphertext: string,
	senderNpub: string
): Promise<string> {
	if (!nsec) {
		throw new Error('No private key found');
	}

	// Get conversation key
	const conversationKey = await nip44.getConversationKey(nsec, senderNpub);

	// Decrypt with NIP-44
	return nip44.decrypt(ciphertext, conversationKey);
}

/**
 * Parse a DM event
 * @param event - The event to parse
 * @param npub - The public key of the recipient
 * @returns The parsed event
 */
export async function parseDMEvent(
	event: NostrEvent,
	npub: string
): Promise<{ plaintext: string; senderPubkey: string }> {
	try {
		if (event.kind !== 4) throw new Error('Not a DM event');

		const senderNpub = event.pubkey;

		let plaintext: string;

		const { nsec } = await getNostrKeyPair();

		if (senderNpub === npub) {
			// We are the sender, so we need to decrypt using the recipient's pubkey
			const recipientTag = event.tags.find((tag) => tag[0] === 'p');
			if (!recipientTag || !recipientTag[1]) {
				throw new Error('No recipient found in message tags');
			}
			const recipientNpub = recipientTag[1];
			plaintext = await decryptDM(nsec, event.content, recipientNpub);
		} else {
			// We are the recipient, decrypt using the sender's pubkey
			plaintext = await decryptDM(nsec, event.content, senderNpub);
		}

		return { plaintext, senderPubkey: senderNpub };
	} catch (error) {
		console.error('Failed to parse DM event:', error);
		throw error;
	}
}

/**
 * Publish an event to multiple relays
 * @param relays - The relays to publish to
 * @param event - The event to publish
 * @returns The results of the publication
 */
export async function publishToMultipleRelays(
	event: NostrEvent,
	relays: string[] = DEFAULT_RELAYS
): Promise<{ relay: string; success: boolean; error?: string }[]> {
	const pool = getPool();

	const publishPromises = relays.map(async (relay) => {
		try {
			const relayPublish = pool.publish([relay], event);
			const outcomes = await Promise.race([
				Promise.all(relayPublish),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error('Publish timeout')), PUBLISH_TIMEOUT_MS)
				)
			]);
			assertRelayOutcomes(outcomes);
			return { relay, success: true };
		} catch (error) {
			return {
				relay,
				success: false,
				error: (error as Error).message
			};
		}
	});

	const results = await Promise.allSettled(publishPromises);

	return results.map((result, index) => {
		if (result.status === 'fulfilled') {
			return result.value;
		} else {
			return {
				relay: relays[index],
				success: false,
				error: result.reason?.message || 'Unknown error'
			};
		}
	});
}

/**
 * Generic function to publish any Nostr event with encryption support
 *
 * This function provides a unified interface for publishing all types of Nostr events,
 * including bids, contracts, and regular messages. It handles encryption, signing,
 * and relay publishing automatically.
 *
 * @param kind - Nostr event kind (from KINDS constant)
 * @param content - Event content (will be encrypted if kind requires it)
 * @param recipientNpub - Recipient's public key (in npub or hex format)
 * @param tags - Array of tags to include in the event
 * @returns Promise<void>
 *
 * @example
 * // Publish a bid event
 * await publishNostrEvent(
 *   KINDS.BIDS,
 *   JSON.stringify(bidData),
 *   taskCreatorPubkey,
 *   [['d', bidId], ['t', taskId], ['p', taskCreatorPubkey]]
 * );
 *
 * @example
 * // Publish a contract event
 * await publishNostrEvent(
 *   KINDS.CONTRACT,
 *   JSON.stringify(contractData),
 *   freelancerPubkey,
 *   [['d', escrowId], ['t', taskId], ['p', freelancerPubkey]]
 * );
 */
export async function publishNostrEvent(
	kind: number,
	content: string,
	recipientNpub: string,
	tags: string[][],
	relays: string[] = DEFAULT_RELAYS,
	createdAt?: number
): Promise<{
	event: NostrEvent;
	results: { relay: string; success: boolean; error?: string }[];
}> {
	try {
		// Convert recipient pubkey to hex if it's in npub format
		const recipientPubkeyHex = recipientNpub.startsWith('npub')
			? (nip19.decode(recipientNpub).data as string)
			: recipientNpub;

		const { nsec } = await getNostrKeyPair();

		// Encrypt content if needed
		const eventContent = encryptedKinds.includes(kind)
			? await encryptDM(nsec, content, recipientPubkeyHex)
			: content;

		// Create event metadata for signing
		const eventMetadata: Partial<NostrEvent> = {
			kind,
			content: eventContent,
			tags,
			created_at: createdAt
		};

		// Sign the event
		const signedEvent = await getSignedEvent(eventMetadata);

		// Publish to relays
		const results = await publishToMultipleRelays(signedEvent, relays);

		// Check if at least one relay succeeded
		const successfulRelays = results.filter((r) => r.success);
		if (successfulRelays.length === 0) {
			const errors = results.map((r) => `${r.relay}: ${r.error}`).join(', ');
			throw new Error(`Failed to publish to any relay: ${errors}`);
		}

		// Log any failed relays for monitoring
		const failedRelays = results.filter((r) => !r.success);
		if (failedRelays.length > 0) {
			console.warn('Some relays failed:', failedRelays);
		}
		return {
			event: signedEvent,
			results
		};
	} catch (err: unknown) {
		const errorMessage = (err as Error)?.message || 'Failed to publish event';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}

/**
 * Generic function to query Nostr events with automatic decryption and optional followup queries
 *
 * This function provides a unified interface for querying all types of Nostr events,
 * with automatic decryption for encrypted event kinds (DMs, bids, contracts).
 *
 * It also supports followup queries (e.g., fetching status events for contracts) which are
 * executed in a single batch. Followup events are automatically linked to their parent events
 * by event ID (followup events reference parent event IDs in their #e tags).
 *
 * @param filter - Nostr filter object (supports kinds, authors, tags, limit, since, until)
 * @param followupFilter - Optional base filter for followup events (kinds, limit, other tags).
 *                         The #e tag will be automatically populated with parent event IDs.
 * @param followupConfig - Configuration for how to attach followup events to main events
 *   - attachAs: Property name to attach followup data to parent event (e.g., 'statusEvents')
 *   - keepLatest: If true, only keep most recent followup; if false, keep all as array
 * @param relays - Array of relay URLs to query from
 * @returns Promise<Array> - Array of decrypted events with attached followup events
 *
 * @example
 * // Query contracts with their status events
 * const contractEvents = await queryNostrEvents({
 *   kinds: [KINDS.CONTRACT],
 *   '#p': [userPubkey],
 *   limit: 50
 * }, {
 *   kinds: [KINDS.CONTRACT_STATUS],  // Kind of followup events
 *   limit: 500                       // Limit for followup query
 * }, {
 *   attachAs: 'statusEvents',        // Attach as array property
 *   keepLatest: false                // Keep all status events
 * });
 *
 * @example
 * // Query bids with their latest status
 * const bidEvents = await queryNostrEvents({
 *   kinds: [KINDS.BIDS],
 *   '#t': [taskId],
 *   '#p': [userPubkey],
 *   limit: 100
 * }, {
 *   kinds: [KINDS.BID_STATUS],
 *   limit: 500
 * }, {
 *   attachAs: 'latestStatus',
 *   keepLatest: true  // Only keep the most recent status
 * });
 */
export async function queryNostrEvents(
	filter: Filter,
	followupFilter?: Filter,
	followupConfig?: {
		attachAs: string; // Property name to attach followup to (e.g., 'statusEvents')
		keepLatest?: boolean; // If true, only keep the most recent followup event
	},
	relays: string[] = DEFAULT_RELAYS
): Promise<NostrEvent[]> {
	try {
		const pool = getPool();
		const npub = await getNpub();
		const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// The shared pool can leave this query open. Read the relay directly when it does.
		let events = await readPoolEvents(pool, relays, filter);
		if (events.length === 0 && isE2ETest()) {
			try {
				const localEvents = await nostrEventsService.findEvents();
				events = localEvents.data.filter((event) =>
					matchesLocalFilter(event, filter)
				) as NostrEvent[];
			} catch (error) {
				console.warn('[nostr] Local E2E event fallback unavailable:', error);
			}
		}

		// Query followup events if followupFilter is provided
		let followupMap: Map<string, NostrEvent | NostrEvent[]> | null = null;

		if (followupFilter && followupConfig && events.length > 0) {
			// Extract parent event IDs from main events
			const parentEventId = events.map((e) => e.id);

			// Build followup filter with parent event IDs in #e tag
			const completeFollowupFilter: Filter = {
				...followupFilter,
				'#e': parentEventId // Link followup events to parent event by ID
			};

			// Query followup events
			let followupEvents = await readPoolEvents(pool, relays, completeFollowupFilter);

			const followupNeedsDecryption =
				followupFilter.kinds?.some((kind) => encryptedKinds.includes(kind)) ?? false;

			// Decrypt followup events if needed
			if (followupNeedsDecryption) {
				const { nsec } = await getNostrKeyPair();

				const decryptedFollowupEvents: NostrEvent[] = [];

				for (const event of followupEvents) {
					try {
						let otherPubkey: string;

						if (event.pubkey === userPubkeyHex) {
							const recipientTag = event.tags.find((tag) => tag[0] === 'p');
							if (!recipientTag || !recipientTag[1]) {
								continue;
							}
							otherPubkey = recipientTag[1];
						} else {
							otherPubkey = event.pubkey;
						}

						const decryptedContent = await decryptDM(nsec, event.content, otherPubkey);
						decryptedFollowupEvents.push({
							...event,
							content: JSON.parse(decryptedContent)
						});
					} catch (error) {
						// Skip failed decryption
						if (!isInvalidMacError(error)) {
							console.error('Failed to decrypt followup event:', event.id, error);
						}
					}
				}

				followupEvents = decryptedFollowupEvents;
			}

			// Build a map of followup events keyed by parent event ID (from #e tag)
			// When keepLatest is false, store arrays of events; when true, store single event
			followupMap = new Map<string, NostrEvent | NostrEvent[]>();

			for (const followupEvent of followupEvents) {
				try {
					// Get the parent event ID from the #e tag
					const parentEventIdTag = followupEvent.tags.find((tag) => tag[0] === 'e');
					const parentEventId = parentEventIdTag?.[1];

					if (parentEventId) {
						if (followupConfig.keepLatest) {
							// Keep only the most recent event
							const existing = followupMap.get(parentEventId) as NostrEvent | undefined;
							if (!existing || followupEvent.created_at > existing.created_at) {
								followupMap.set(parentEventId, followupEvent);
							}
						} else {
							// Store all events in an array
							const existing = followupMap.get(parentEventId) as NostrEvent[] | undefined;
							if (existing) {
								existing.push(followupEvent);
							} else {
								followupMap.set(parentEventId, [followupEvent]);
							}
						}
					}
				} catch (error) {
					console.warn('Failed to process followup event:', error);
				}
			}
		}

		// Check if any of the queried kinds need decryption
		const needsDecryption = filter.kinds?.some((kind) => encryptedKinds.includes(kind)) ?? false;

		// If decryption is not needed, return events as-is (but still attach followup if available)
		if (!needsDecryption) {
			if (followupMap && followupConfig) {
				// Attach followup events to main events even if not encrypted
				return events.map((event) => {
					// Lookup followup events by parent event ID
					const followupData = followupMap.get(event.id);

					if (followupData) {
						return {
							...event,
							[followupConfig.attachAs]: followupData
						};
					}

					return event;
				});
			}
			return events;
		}

		// Decrypt events - use for...of to skip failed decryptions without filtering nulls
		const decryptedEvents: NostrEvent[] = [];

		for (const event of events) {
			const { nsec } = await getNostrKeyPair();
			if (!nsec) {
				throw new Error('No private key found');
			}

			try {
				// Determine the other party's pubkey for decryption
				let otherPubkey: string;

				if (event.pubkey === userPubkeyHex) {
					// We are the sender, decrypt with recipient's key
					const recipientTag = event.tags.find((tag) => tag[0] === 'p');
					if (!recipientTag || !recipientTag[1]) {
						console.warn('No recipient found in event tags:', event.id);
						continue; // Skip this event
					}
					otherPubkey = recipientTag[1];
				} else {
					// We are the recipient, decrypt with sender's key
					otherPubkey = event.pubkey;
				}

				// Decrypt content
				const decryptedContent = await decryptDM(nsec, event.content, otherPubkey);
				const parsedContent = JSON.parse(decryptedContent);

				// Attach followup event if available
				const decryptedEvent: NostrEvent = {
					...event,
					content: parsedContent
				};

				// Attach followup event(s) during decryption loop
				if (followupMap && followupConfig) {
					// Lookup followup events by parent event ID
					const followupData = followupMap.get(event.id);

					if (followupData) {
						(decryptedEvent as Record<string, unknown>)[followupConfig.attachAs] = followupData;
					}
				}

				// Add successfully decrypted event
				decryptedEvents.push(decryptedEvent);
			} catch (error) {
				// Skip events that fail to decrypt (not meant for us or corrupted)
				if (!isInvalidMacError(error)) {
					console.error('Failed to decrypt event:', event.id, error);
				}
				// Continue to next event without adding to results
			}
		}

		return decryptedEvents;
	} catch (err: unknown) {
		const errorMessage = (err as Error)?.message || 'Failed to query events';
		console.error('Query error:', errorMessage);
		throw err;
	}
}

/**
 * Truncate npub string to `npub1a23...4567` format
 * @param npub - Nostr public key in npub format (e.g., "npub1abc123...")
 * @returns Truncated npub string (e.g., "npub1a23...4567")
 */
export function truncateNpub(_npub: string): string {
	let npub = _npub;
	if (!npub.startsWith('npub')) {
		npub = nip19.npubEncode(npub);
	}
	return npub.slice(0, 6) + '...' + npub.slice(-6);
}
