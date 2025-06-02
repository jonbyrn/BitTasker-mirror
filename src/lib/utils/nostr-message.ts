import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { nip04, nip19 } from 'nostr-tools';
import { getNostrKeyPair } from './nostrKeys';
import { bytesToHex } from '@noble/hashes/utils';
import { subscribeToEvents, getSignedEvent } from './nostr';
import { PUBLIC_NOSTR_RELAY_URL, PUBLIC_NOSTR_RELAY_URL_MOCK4 } from '$env/static/public';
import { appStore } from '$lib/stores/app.store';

// --- Relay Configuration ---
const DEFAULT_RELAYS = [
	PUBLIC_NOSTR_RELAY_URL,
	// PUBLIC_NOSTR_RELAY_URL_MOCK1,
	// PUBLIC_NOSTR_RELAY_URL_MOCK2,
	// PUBLIC_NOSTR_RELAY_URL_MOCK3,
	PUBLIC_NOSTR_RELAY_URL_MOCK4
].filter(Boolean); // Remove any undefined values

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
	return nip04.encrypt(senderPrivkey, recipientPubkey, plaintext);
}

async function decryptDM(
	ciphertext: string,
	senderPubkey: string,
	recipientPrivkey: string
): Promise<string> {
	return nip04.decrypt(recipientPrivkey, senderPubkey, ciphertext);
}

async function parseDMEvent(
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

export async function fetchProfileMetadata(
	pubkey: string
): Promise<{ name?: string; picture?: string }> {
	try {
		const filter: Filter = {
			kinds: [0, 1063],
			authors: [pubkey],
			limit: 10
		};

		const events = await withRetry(() => queryMultipleRelays(DEFAULT_RELAYS, filter));

		let name: string | undefined = undefined;
		let picture: string | undefined = undefined;

		for (const event of events) {
			if (event.kind === 0 && event.content) {
				try {
					const content = JSON.parse(event.content);
					name = content.name;
					picture = content.picture;
				} catch (e) {
					console.error('Failed to parse profile metadata:', e);
				}
			} else if (event.kind === 1063) {
				const urlTag = event.tags.find((t) => t[0] === 'url');
				if (urlTag && urlTag[1]) {
					picture = urlTag[1];
				}
			}
		}

		return { name, picture };
	} catch (error) {
		console.error('Failed to fetch profile metadata:', error);
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
	threadRootId?: string
): Promise<void> {
	try {
		const { nsec } = await getNostrKeyPair();
		const senderPrivkey = bytesToHex(nsec);

		// Convert recipient pubkey to hex if it's in npub format
		const recipientPubkeyHex = recipientPubkey.startsWith('npub')
			? (nip19.decode(recipientPubkey).data as string)
			: recipientPubkey;

		const ciphertext = await encryptDM(message, recipientPubkeyHex, senderPrivkey);
		const tags: string[][] = threadRootId ? [['e', threadRootId, '', 'root']] : [];

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
			privkey = bytesToHex(nsec);
			// Convert npub to hex format for relay filters
			pubkeyHex = nip19.decode(npub).data as string;

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
							console.log('📡 Real-time message received:');
							console.log(`  Event ID: ${event.id}`);
							console.log(`  Author: ${event.pubkey}`);
							console.log(`  Timestamp: ${new Date(event.created_at * 1000).toISOString()}`);
							console.log(`  Content: ${event.content.substring(0, 50)}...`);
							console.log(`  Tags:`, event.tags);

							const { plaintext, senderPubkey } = await parseDMEvent(event, privkey);

							console.log('✅ Real-time message decrypted:');
							console.log(`  Sender: ${senderPubkey}`);
							console.log(`  Message: "${plaintext}"`);
							console.log(`  Event ID: ${event.id}`);

							callback({ plaintext, senderPubkey, event });
						} catch (err: unknown) {
							console.error('❌ Failed to decrypt real-time message:', err);
						}
					});

					// Successfully connected
					console.log(`Connected to relay: ${relay}`);
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
				console.log('Attempting to reconnect...');
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
		// Convert npub to hex format for relay filters
		const pubkeyHex = nip19.decode(npub).data as string;

		// Convert withPubkey to hex if it's in npub format
		const withPubkeyHex = withPubkey.startsWith('npub')
			? (nip19.decode(withPubkey).data as string)
			: withPubkey;

		console.log('🔍 getMessageHistory - Debug Info:');
		console.log('Current user pubkey (hex):', pubkeyHex);
		console.log('Recipient pubkey (hex):', withPubkeyHex);
		console.log('Private key available:', !!privkey);

		const filter: Filter = {
			kinds: [4],
			authors: [withPubkeyHex, pubkeyHex],
			'#p': [withPubkeyHex, pubkeyHex],
			limit: options?.limit || 50,
			...(options?.since ? { since: options.since } : {}),
			...(options?.until ? { until: options.until } : {})
		};

		console.log('📡 Filter being used:', JSON.stringify(filter, null, 2));

		const events = await withRetry(() => queryMultipleRelays(DEFAULT_RELAYS, filter));

		console.log('📨 Raw events received from relay:', events.length);
		events.forEach((event, index) => {
			console.log(`📧 Event ${index + 1}:`);
			console.log(`  ID: ${event.id}`);
			console.log(`  Author: ${event.pubkey}`);
			console.log(`  Timestamp: ${new Date(event.created_at * 1000).toISOString()}`);
			console.log(`  Content: ${event.content.substring(0, 50)}...`);
			console.log(`  Tags:`, event.tags);
		});

		const decrypted = await Promise.all(
			events.map(async (event, index) => {
				try {
					console.log(`🔓 Attempting to decrypt event ${index + 1} (${event.id})`);
					const { plaintext, senderPubkey } = await parseDMEvent(event, privkey);
					console.log(`✅ Successfully decrypted event ${index + 1}:`);
					console.log(`  Sender: ${senderPubkey}`);
					console.log(`  Message: "${plaintext}"`);
					console.log(`  Event ID: ${event.id}`);
					console.log(`  Timestamp: ${new Date(event.created_at * 1000).toISOString()}`);
					return { plaintext, senderPubkey, event };
				} catch (error) {
					console.error(`❌ Failed to decrypt event ${index + 1} (${event.id}):`, error);
					return null;
				}
			})
		);

		const validMessages = decrypted.filter(Boolean) as {
			plaintext: string;
			senderPubkey: string;
			event: NostrEvent;
		}[];

		console.log('✨ Final decrypted messages:', validMessages.length);
		validMessages.forEach((msg, index) => {
			console.log(`📝 Message ${index + 1}:`);
			console.log(`  From: ${msg.senderPubkey}`);
			console.log(`  Text: "${msg.plaintext}"`);
			console.log(`  Time: ${new Date(msg.event.created_at * 1000).toISOString()}`);
			console.log(`  ID: ${msg.event.id}`);
		});

		return validMessages;
	} catch (err: unknown) {
		console.error('💥 getMessageHistory error:', err);
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
		const { npub } = await getNostrKeyPair();
		// Convert npub to hex format for relay filters
		const pubkeyHex = nip19.decode(npub).data as string;

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

		// Fetch profiles in parallel
		const results = await Promise.all(
			Array.from(peopleMap.entries()).map(async ([pubkey, lastEvent]) => {
				let profile = {
					name: undefined as string | undefined,
					picture: undefined as string | undefined
				};

				try {
					const fetchedProfile = await fetchProfileMetadata(pubkey);
					profile = {
						name: fetchedProfile.name,
						picture: fetchedProfile.picture
					};
				} catch (e) {
					console.error('Failed to fetch profile for', pubkey, e);
				}

				return { pubkey, lastEvent, profile };
			})
		);

		return results;
	} catch (err: unknown) {
		const errorMessage = (err as Error)?.message || 'Failed to fetch messaged people';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}
