/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { getNostrKeyPair } from './nostrKeys';
import { bytesToHex } from '@noble/hashes/utils';
import { subscribeToEvents, getSignedEvent } from './nostr';
import { appStore } from '$lib/stores/app.store';
import { profileCache } from './profile-cache';
import nip44 from '$lib/nostr/nip44';
import KINDS from '$lib/utils/constants/kinds';

// --- Relay Configuration ---
const DEFAULT_RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean); // Remove any undefined values

const RELAY_TIMEOUT = 10000; // 10 seconds
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

// --- Enhanced Relay Management ---
interface RelayConnectionResult {
	relay: string;
	success: boolean;
	error?: string;
}

async function withRetry<T>(
	operation: () => Promise<T>,
	maxAttempts: number = MAX_RETRY_ATTEMPTS,
	delay: number = RETRY_DELAY
): Promise<T> {
	let lastError: Error;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error as Error;

			if (attempt === maxAttempts) {
				break;
			}

			// Wait before retrying
			await new Promise((resolve) => setTimeout(resolve, delay * attempt));
		}
	}

	throw lastError!;
}

async function tryWithTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number = RELAY_TIMEOUT
): Promise<T> {
	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error('Operation timeout')), timeoutMs);
	});

	return Promise.race([promise, timeoutPromise]);
}

async function queryMultipleRelays(relays: string[], filter: Filter): Promise<NostrEvent[]> {
	const pool = (await import('nostr-tools/pool')).SimplePool;
	const relayPool = new pool();

	// Try relays in order, return first successful result
	for (const relay of relays) {
		try {
			const events = await tryWithTimeout(relayPool.querySync([relay], filter), RELAY_TIMEOUT);

			if (events && events.length > 0) {
				return events;
			}
		} catch (error) {
			console.warn(`Failed to query relay ${relay}:`, error);
			continue;
		}
	}

	// If no relay returned results, try them all at once as fallback
	try {
		return await tryWithTimeout(relayPool.querySync(relays, filter), RELAY_TIMEOUT * 2);
	} catch (error) {
		console.error('All relays failed:', error);
		throw new Error('Failed to connect to any relay');
	}
}

async function publishToMultipleRelays(
	relays: string[],
	event: NostrEvent
): Promise<RelayConnectionResult[]> {
	const pool = (await import('nostr-tools/pool')).SimplePool;
	const relayPool = new pool();

	const publishPromises = relays.map(async (relay) => {
		try {
			const pubPromises = relayPool.publish([relay], event);
			await tryWithTimeout(Promise.all(pubPromises), RELAY_TIMEOUT);
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

// --- Internal helpers ---
async function encryptDM(
	plaintext: string,
	recipientPubkey: string,
	senderPrivkey: string
): Promise<string> {
	// Generate 32-byte nonce
	const nonce = crypto.getRandomValues(new Uint8Array(32));

	// Get conversation key
	const conversationKey = await nip44.getConversationKey(senderPrivkey, recipientPubkey);

	// Encrypt with NIP-44
	return nip44.encrypt(plaintext, conversationKey, nonce);
}

async function decryptDM(
	ciphertext: string,
	senderPubkey: string,
	recipientPrivkey: string
): Promise<string> {
	// Get conversation key
	const conversationKey = await nip44.getConversationKey(recipientPrivkey, senderPubkey);

	// Decrypt with NIP-44
	return nip44.decrypt(ciphertext, conversationKey);
}

export async function parseDMEvent(
	event: NostrEvent,
	currentUserPrivkey: string
): Promise<{ plaintext: string; senderPubkey: string }> {
	if (event.kind !== 4) throw new Error('Not a DM event');

	const senderPubkey = event.pubkey;

	// Get current user's public key from private key
	const { getPublicKey } = await import('nostr-tools');
	const { hexToBytes } = await import('@noble/hashes/utils');
	const currentUserPubkey = getPublicKey(hexToBytes(currentUserPrivkey));

	let plaintext: string;

	if (senderPubkey === currentUserPubkey) {
		// We are the sender, so we need to decrypt using the recipient's pubkey
		const recipientTag = event.tags.find((tag) => tag[0] === 'p');
		if (!recipientTag || !recipientTag[1]) {
			throw new Error('No recipient found in message tags');
		}
		const recipientPubkey = recipientTag[1];
		plaintext = await decryptDM(event.content, recipientPubkey, currentUserPrivkey);
	} else {
		// We are the recipient, decrypt using the sender's pubkey
		plaintext = await decryptDM(event.content, senderPubkey, currentUserPrivkey);
	}

	return { plaintext, senderPubkey };
}

/**
 * Subscribe to profile updates for a specific pubkey
 * Returns an unsubscribe function
 */
export function subscribeToProfileUpdates(
	pubkey: string,
	callback: (profile: { name?: string; picture?: string }) => void,
	relays: string[] = DEFAULT_RELAYS
): () => void {
	let sub: any = null;

	const setupSubscription = async () => {
		const { SimplePool } = await import('nostr-tools/pool');
		const pool = new SimplePool();

		try {
			// Convert pubkey to hex format if it's in npub format
			const pubkeyHex = pubkey.startsWith('npub') ? (nip19.decode(pubkey).data as string) : pubkey;

			const filter: Filter = {
				kinds: [0, KINDS.FILE_METADATA, 30063], // Profile metadata, file metadata, and profile images
				authors: [pubkeyHex]
			};
			let profile: { name?: string; picture?: string } = {};

			sub = pool.subscribe(relays, filter, {
				onevent: async (event: NostrEvent) => {
					// Create a new profile object for each update to ensure reactivity
					const updatedProfile: { name?: string; picture?: string } = { ...profile };

					if (event.kind === 0 && event.content) {
						try {
							const content = JSON.parse(event.content);
							// Map displayName to name if name is not available
							updatedProfile.name = content.name || content.displayName;
							updatedProfile.picture = content.picture || content.avatar || content.image;
						} catch (e) {
							console.error('❌ Failed to parse profile metadata in subscription:', e);
						}
					} else if (event.kind === 30063) {
						// Handle kind 30063 (profile images) - same as fetchProfileMetadata
						const dTag = event.tags.find((t) => t[0] === 'd');

						if (dTag && dTag[1] === 'profile-images') {
							try {
								const images = JSON.parse(event.content);

								if (Array.isArray(images) && images.length > 0) {
									// Use the first image as the primary profile picture
									updatedProfile.picture = images[0].url;
								}
							} catch (e) {
								console.error('❌ Failed to parse profile images in subscription:', e);
							}
						}
					} else if (event.kind === KINDS.FILE_METADATA) {
						const urlTag = event.tags.find((t) => t[0] === 'url');
						const altTag = event.tags.find((t) => t[0] === 'alt');
						const mTag = event.tags.find((t) => t[0] === 'm');

						if (urlTag && urlTag[1]) {
							const alt = altTag && altTag[1] ? altTag[1].toLowerCase() : '';
							const mime = mTag && mTag[1] ? mTag[1].toLowerCase() : '';

							if (
								alt.includes('profile') ||
								alt.includes('avatar') ||
								mime.startsWith('image/') ||
								urlTag[1].match(/\.(jpg|jpeg|png|gif|webp)$/i)
							) {
								updatedProfile.picture = urlTag[1];
							}
						}
					}

					// Update the profile reference
					profile = updatedProfile;

					// Update cache
					await profileCache.cacheProfile(pubkeyHex, profile);

					// Notify callback with debug info
					callback(profile);
				}
			});
		} catch (error) {
			console.error('❌ Failed to setup profile subscription:', error);
		}
	};

	// Start subscription
	setupSubscription().catch(console.error);

	// Return cleanup function
	return () => {
		if (sub) {
			sub.close();
		}
	};
}

export async function fetchProfileMetadata(
	pubkey: string
): Promise<{ name?: string; picture?: string }> {
	try {
		// First check cache
		const cachedProfile = await profileCache.getProfile(pubkey);
		if (cachedProfile) {
			return cachedProfile;
		}

		// If not in cache, fetch from relays
		const filter: Filter = {
			kinds: [0, KINDS.FILE_METADATA, 30063, 10002], // Profile metadata, file metadata, profile images, and NIP-65 relay list
			authors: [pubkey],
			limit: 20 // Increased limit to get more profile events
		};

		const events = await withRetry(() => queryMultipleRelays(DEFAULT_RELAYS, filter));

		let name: string | undefined = undefined;
		let picture: string | undefined = undefined;

		// Sort events by created_at (newest first) to get the latest profile info
		const sortedEvents = events.sort((a, b) => b.created_at - a.created_at);

		for (const event of sortedEvents) {
			if (event.kind === 0 && event.content) {
				try {
					const content = JSON.parse(event.content);

					// Map displayName to name if name is not available
					if ((content.name || content.displayName) && !name) {
						name = content.name || content.displayName;
					}

					if (content.picture && !picture) {
						picture = content.picture;
					}

					// Also check for other common picture fields
					if (!picture && content.avatar) {
						picture = content.avatar;
					}

					if (!picture && content.image) {
						picture = content.image;
					}
				} catch (e) {
					console.error('❌ Failed to parse profile metadata:', e);
				}
			} else if (event.kind === 30063) {
				// Handle kind 30063 (profile images) - same technique as profile page
				const dTag = event.tags.find((t) => t[0] === 'd');

				// Check if this is the profile-images event (same as profile page)
				if (dTag && dTag[1] === 'profile-images' && !picture) {
					try {
						const images = JSON.parse(event.content);

						if (Array.isArray(images) && images.length > 0) {
							// Use the first image as the primary profile picture (same as profile page)
							picture = images[0].url;
						}
					} catch (e) {
						console.error('❌ Failed to parse profile images content:', e);
					}
				}
			} else if (event.kind === KINDS.FILE_METADATA) {
				const urlTag = event.tags.find((t) => t[0] === 'url');
				const altTag = event.tags.find((t) => t[0] === 'alt');
				const mTag = event.tags.find((t) => t[0] === 'm'); // MIME type

				if (urlTag && urlTag[1] && !picture) {
					// Check if this is likely a profile picture
					const alt = altTag && altTag[1] ? altTag[1].toLowerCase() : '';
					const mime = mTag && mTag[1] ? mTag[1].toLowerCase() : '';

					if (
						alt.includes('profile') ||
						alt.includes('avatar') ||
						mime.startsWith('image/') ||
						urlTag[1].match(/\.(jpg|jpeg|png|gif|webp)$/i)
					) {
						picture = urlTag[1];
					}
				}
			}
		}

		const profile = { name, picture };

		// Cache the result (even if empty, to avoid repeated failed requests)
		await profileCache.cacheProfile(pubkey, profile);

		return profile;
	} catch (error) {
		console.error('💥 Failed to fetch profile metadata for', pubkey, ':', error);
		// Cache empty result to avoid repeated failed requests
		await profileCache.cacheProfile(pubkey, {});
		return {};
	}
}

// --- High-level API ---

/**
 * Send a direct message to a public key
 */
export async function sendDirectMessage(
	message: string,
	recipientPubkey: string,
	threadRootId?: string,
	additionalTags?: string[][]
): Promise<void> {
	try {
		const { nsec } = await getNostrKeyPair();
		const senderPrivkey = bytesToHex(nsec);

		// Convert recipient pubkey to hex if it's in npub format
		const recipientPubkeyHex = recipientPubkey.startsWith('npub')
			? (nip19.decode(recipientPubkey).data as string)
			: recipientPubkey;

		const ciphertext = await encryptDM(message, recipientPubkeyHex, senderPrivkey);
		const tags: string[][] = [];

		// Add thread root tag if provided
		if (threadRootId) {
			tags.push(['e', threadRootId, '', 'root']);
		}

		// Add any additional custom tags
		if (additionalTags && additionalTags.length > 0) {
			tags.push(...additionalTags);
		}

		// Create event metadata for signing
		const eventMetadata: Partial<NostrEvent> = {
			kind: 4,
			content: ciphertext,
			tags: [['p', recipientPubkeyHex], ...tags],
			created_at: Math.floor(Date.now() / 1000)
		};

		// Sign the event
		const signedEvent = await getSignedEvent(eventMetadata);

		const results = await withRetry(() => publishToMultipleRelays(DEFAULT_RELAYS, signedEvent));

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
	} catch (err: unknown) {
		const errorMessage = (err as Error)?.message || 'Failed to send message';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}

/**
 * Listen for incoming DMs for the current user with auto-reconnection
 * Returns an unsubscribe function
 */
export function listenForIncomingMessages(
	callback: (msg: { plaintext: string; senderPubkey: string; event: NostrEvent }) => void
): () => void {
	let privkey: string;
	let pubkeyHex: string;
	let unsub: (() => void) | null = null;
	let reconnectTimeout: NodeJS.Timeout | null = null;
	let isUnsubscribed = false;

	const setupConnection = async () => {
		if (isUnsubscribed) return;

		try {
			const { nsec, npub } = await getNostrKeyPair();

			// Validate npub format before attempting to decode
			if (!npub || typeof npub !== 'string') {
				throw new Error('Invalid npub: not a string or empty');
			}

			privkey = bytesToHex(nsec);

			// Handle both hex and npub formats
			if (npub.startsWith('npub')) {
				// It's already in npub format, decode it
				try {
					const decoded = nip19.decode(npub);
					if (decoded.type !== 'npub') {
						throw new Error(`Expected npub type, got: ${decoded.type}`);
					}
					pubkeyHex = decoded.data as string;
				} catch (decodeError) {
					console.error('Failed to decode npub:', decodeError);
					throw new Error(`Failed to decode npub ${npub}: ${(decodeError as Error).message}`);
				}
			} else if (/^[0-9a-fA-F]{64}$/.test(npub)) {
				// It's a hex string, use it directly
				pubkeyHex = npub.toLowerCase();
			} else {
				throw new Error(
					`Invalid pubkey format: expected npub or 64-char hex, got: ${npub.substring(0, 20)}...`
				);
			}

			// Listen for both incoming messages (where current user is in #p tag)
			// and outgoing messages (where current user is the author)
			const filters: Filter[] = [
				{
					kinds: [4],
					'#p': [pubkeyHex], // Messages TO the current user
					limit: 100
				},
				{
					kinds: [4],
					authors: [pubkeyHex], // Messages FROM the current user
					limit: 100
				}
			];

			// Try primary relay first, then fallback to others
			for (const relay of DEFAULT_RELAYS) {
				if (isUnsubscribed) return;

				try {
					unsub = subscribeToEvents(relay, filters, async (event: NostrEvent) => {
						try {
							const { plaintext, senderPubkey } = await parseDMEvent(event, privkey);

							callback({ plaintext, senderPubkey, event });
						} catch (err: unknown) {
							console.error('❌ Failed to decrypt real-time message:', err);
						}
					});

					// Successfully connected
					break;
				} catch (error) {
					console.warn(`Failed to connect to relay ${relay}:`, error);
					continue;
				}
			}

			// If all relays failed, schedule reconnect
			if (!unsub && !isUnsubscribed) {
				console.warn('All relays failed, scheduling reconnect...');
				scheduleReconnect();
			}
		} catch (error) {
			console.error('Failed to setup message listener:', error);
			if (!isUnsubscribed) {
				scheduleReconnect();
			}
		}
	};

	const scheduleReconnect = () => {
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
		}

		if (!isUnsubscribed) {
			reconnectTimeout = setTimeout(() => {
				setupConnection();
			}, 5000); // Reconnect after 5 seconds
		}
	};

	// Initial setup
	setupConnection();

	// Return unsubscribe function
	return () => {
		isUnsubscribed = true;

		if (unsub) {
			unsub();
			unsub = null;
		}

		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}
	};
}

/**
 * Get paginated DM history with a specific user
 */
export async function getMessageHistory(
	withPubkey: string,
	options?: { limit?: number; since?: number; until?: number }
): Promise<{ plaintext: string; senderPubkey: string; event: NostrEvent }[]> {
	try {
		const { nsec, npub } = await getNostrKeyPair();
		const privkey = bytesToHex(nsec);

		// Validate and convert npub to hex format for relay filters
		if (!npub || typeof npub !== 'string') {
			throw new Error('Invalid npub: not a string or empty');
		}

		let pubkeyHex: string;

		// Handle both hex and npub formats
		if (npub.startsWith('npub')) {
			// It's already in npub format, decode it
			try {
				const decoded = nip19.decode(npub);
				if (decoded.type !== 'npub') {
					throw new Error(`Expected npub type, got: ${decoded.type}`);
				}
				pubkeyHex = decoded.data as string;
			} catch (decodeError) {
				console.error('Failed to decode npub:', decodeError);
				throw new Error(`Failed to decode npub ${npub}: ${(decodeError as Error).message}`);
			}
		} else if (/^[0-9a-fA-F]{64}$/.test(npub)) {
			// It's a hex string, use it directly
			pubkeyHex = npub.toLowerCase();
		} else {
			throw new Error(
				`Invalid pubkey format: expected npub or 64-char hex, got: ${npub.substring(0, 20)}...`
			);
		}

		// Convert withPubkey to hex if it's in npub format
		const withPubkeyHex = withPubkey.startsWith('npub')
			? (nip19.decode(withPubkey).data as string)
			: withPubkey;

		const filter: Filter = {
			kinds: [4],
			authors: [withPubkeyHex, pubkeyHex],
			'#p': [withPubkeyHex, pubkeyHex],
			limit: options?.limit || 25,
			...(options?.since ? { since: options.since } : {}),
			...(options?.until ? { until: options.until } : {})
		};

		const events = await withRetry(() => queryMultipleRelays(DEFAULT_RELAYS, filter));

		const decrypted = await Promise.all(
			events.map(async (event, index) => {
				try {
					const { plaintext, senderPubkey } = await parseDMEvent(event, privkey);
					return { plaintext, senderPubkey, event };
				} catch (error) {
					// Only log detailed errors for non-MAC issues to reduce noise
					if (error instanceof Error && !error.message.includes('Invalid MAC')) {
						console.error(`❌ Failed to decrypt event ${index + 1} (${event.id}):`, error);
					}
					return null;
				}
			})
		);

		const validMessages = decrypted.filter(Boolean) as {
			plaintext: string;
			senderPubkey: string;
			event: NostrEvent;
		}[];

		return validMessages;
	} catch (err: unknown) {
		console.error('💥 getMessageHistory error:', err);
		const errorMessage = (err as Error)?.message || 'Failed to fetch message history';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}

/**
 * Optimized: Fetch encrypted DM events first (no private key),
 * in parallel warm up auth (get private key), then decrypt in batch.
 * This allows the passkey/extension prompt to occur while network I/O is in flight.
 */
export async function getMessageHistoryOptimized(
    withPubkey: string,
    options?: { limit?: number; since?: number; until?: number }
): Promise<{ plaintext: string; senderPubkey: string; event: NostrEvent }[]> {
    try {
        // Start auth warmup without awaiting yet
        const authPromise = getNostrKeyPair();

        // Resolve our own pubkey in hex without requiring private key
        const npub = await getNpub();
        const selfHex = npub.startsWith('npub')
            ? (nip19.decode(npub).data as string)
            : npub;

        // Convert withPubkey to hex if it's in npub format
        const withHex = withPubkey.startsWith('npub')
            ? (nip19.decode(withPubkey).data as string)
            : withPubkey;

        const filter: Filter = {
            kinds: [4],
            authors: [withHex, selfHex],
            '#p': [withHex, selfHex],
            limit: options?.limit || 25,
            ...(options?.since ? { since: options.since } : {}),
            ...(options?.until ? { until: options.until } : {})
        };

        // Fetch encrypted events
        const events = await withRetry(() => queryMultipleRelays(DEFAULT_RELAYS, filter));

        // Now await auth and decrypt in batch
        const { nsec } = await authPromise;
        const privkey = bytesToHex(nsec);

        const decrypted = await Promise.all(
            events.map(async (event, index) => {
                try {
                    const { plaintext, senderPubkey } = await parseDMEvent(event, privkey);
                    return { plaintext, senderPubkey, event };
                } catch (error) {
                    if (error instanceof Error && !error.message.includes('Invalid MAC')) {
                        console.error(`❌ Failed to decrypt event ${index + 1} (${event.id}):`, error);
                    }
                    return null;
                }
            })
        );

        return decrypted.filter(Boolean) as {
            plaintext: string;
            senderPubkey: string;
            event: NostrEvent;
        }[];
    } catch (err) {
        console.error('💥 getMessageHistoryOptimized error:', err);
        const errorMessage = (err as Error)?.message || 'Failed to fetch message history';
        appStore.showErrorToast(errorMessage);
        throw err;
    }
}

/**
 * Get all messages in a thread (by root event id)
 */
export async function getThreadMessages(
	threadRootEventId: string,
	options?: { limit?: number; since?: number; until?: number }
): Promise<{ plaintext: string; senderPubkey: string; event: NostrEvent }[]> {
	try {
		const { nsec } = await getNostrKeyPair();
		const privkey = bytesToHex(nsec);

		const filter: Filter = {
			kinds: [4],
			'#e': [threadRootEventId],
			limit: options?.limit || 50,
			...(options?.since ? { since: options.since } : {}),
			...(options?.until ? { until: options.until } : {})
		};

		const events = await withRetry(() => queryMultipleRelays(DEFAULT_RELAYS, filter));

		const decrypted = await Promise.all(
			events.map(async (event) => {
				try {
					const { plaintext, senderPubkey } = await parseDMEvent(event, privkey);
					return { plaintext, senderPubkey, event };
				} catch {
					return null;
				}
			})
		);

		return decrypted.filter(Boolean) as {
			plaintext: string;
			senderPubkey: string;
			event: NostrEvent;
		}[];
	} catch (err: unknown) {
		const errorMessage = (err as Error)?.message || 'Failed to fetch thread messages';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}

/**
 * Get all unique people (pubkeys) you have messaged with, along with the most recent event and their profile (name, picture)
 */
export async function getMessagedPeople(): Promise<
	{ pubkey: string; lastEvent: NostrEvent; profile: { name?: string; picture?: string } }[]
> {
	try {
		const { nsec, npub } = await getNostrKeyPair();
		const privkey = bytesToHex(nsec);

		// Validate and convert npub to hex format for relay filters
		if (!npub || typeof npub !== 'string') {
			throw new Error('Invalid npub: not a string or empty');
		}

		let pubkeyHex: string;

		// Handle both hex and npub formats
		if (npub.startsWith('npub')) {
			// It's already in npub format, decode it
			try {
				const decoded = nip19.decode(npub);
				if (decoded.type !== 'npub') {
					throw new Error(`Expected npub type, got: ${decoded.type}`);
				}
				pubkeyHex = decoded.data as string;
			} catch (decodeError) {
				console.error('Failed to decode npub:', decodeError);
				throw new Error(`Failed to decode npub ${npub}: ${(decodeError as Error).message}`);
			}
		} else if (/^[0-9a-fA-F]{64}$/.test(npub)) {
			// It's a hex string, use it directly
			pubkeyHex = npub.toLowerCase();
		} else {
			throw new Error(
				`Invalid pubkey format: expected npub or 64-char hex, got: ${npub.substring(0, 20)}...`
			);
		}

		const sentFilter: Filter = {
			kinds: [4],
			authors: [pubkeyHex],
			limit: 1000 // adjust as needed for pagination
		};

		const receivedFilter: Filter = {
			kinds: [4],
			'#p': [pubkeyHex],
			limit: 1000
		};

		// Fetch both sent and received messages with retry logic
		const [sentEvents, receivedEvents] = await Promise.all([
			withRetry(() => queryMultipleRelays(DEFAULT_RELAYS, sentFilter)),
			withRetry(() => queryMultipleRelays(DEFAULT_RELAYS, receivedFilter))
		]);

		const allEvents = [...sentEvents, ...receivedEvents];

		// Map: pubkey -> latest event
		const peopleMap = new Map<string, NostrEvent>();

		for (const event of allEvents) {
			let otherPubkey: string | undefined;
			if (event.pubkey === pubkeyHex) {
				// I am the sender, recipient is in p tag
				const pTag = event.tags.find((t) => t[0] === 'p');
				if (pTag && pTag[1]) otherPubkey = pTag[1];
			} else {
				// I am the recipient, sender is event.pubkey
				otherPubkey = event.pubkey;
			}

			if (!otherPubkey || otherPubkey === pubkeyHex) continue;

			const prev = peopleMap.get(otherPubkey);
			if (!prev || event.created_at > prev.created_at) {
				peopleMap.set(otherPubkey, event);
			}
		}

		// Fetch profiles and decrypt last messages in parallel
		const results = await Promise.all(
			Array.from(peopleMap.entries()).map(async ([pubkey, lastEvent]) => {
				let profile = {
					name: undefined as string | undefined,
					picture: undefined as string | undefined
				};

				// Decrypt the last message content
				let decryptedLastEvent = lastEvent;
				try {
					const { plaintext } = await parseDMEvent(lastEvent, privkey);
					// Create a new event object with decrypted content for display
					decryptedLastEvent = {
						...lastEvent,
						content: plaintext
					};
				} catch (decryptError) {
					// Only log detailed errors for non-MAC issues to reduce noise
					if (decryptError instanceof Error && !decryptError.message.includes('Invalid MAC')) {
						console.error('Failed to decrypt last message for', pubkey, decryptError);
					}
					// Keep the original event but mark content as undecryptable
					decryptedLastEvent = {
						...lastEvent,
						content: '[Unable to decrypt message]'
					};
				}

				try {
					const fetchedProfile = await fetchProfileMetadata(pubkey);
					profile = {
						name: fetchedProfile.name,
						picture: fetchedProfile.picture
					};
				} catch (e) {
					console.error('Failed to fetch profile for', pubkey, e);
				}

				return { pubkey, lastEvent: decryptedLastEvent, profile };
			})
		);

		return results;
	} catch (err: unknown) {
		const errorMessage = (err as Error)?.message || 'Failed to fetch messaged people';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}

/**
 * Check if a message is a bid
 */
export function isBidMessage(message: { plaintext: string }): boolean {
	try {
		const parsedContent = JSON.parse(message.plaintext);
		return parsedContent.messageType === 'bid' && parsedContent.type === 'bid';
	} catch {
		return false;
	}
}

/**
 * Check if a message is a normal message (not a bid)
 */
export function isNormalMessage(message: { plaintext: string }): boolean {
	return !isBidMessage(message);
}