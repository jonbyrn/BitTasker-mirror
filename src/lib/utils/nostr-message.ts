import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { nip04 } from 'nostr-tools';
import { getNostrKeyPair } from './nostrKeys';
import { bytesToHex } from '@noble/hashes/utils';
import { subscribeToEvents } from './nostr';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { appStore } from '$lib/stores/app.store';

// --- Relay Configuration ---
const DEFAULT_RELAYS = [PUBLIC_NOSTR_RELAY_URL].filter(Boolean); // Remove any undefined values

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
	event: Partial<NostrEvent>
): Promise<RelayConnectionResult[]> {
	const pool = (await import('nostr-tools/pool')).SimplePool;
	const relayPool = new pool();

	const publishPromises = relays.map(async (relay) => {
		try {
			const pubPromises = relayPool.publish([relay], event as NostrEvent);
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

function createDMEvent(
	ciphertext: string,
	recipientPubkey: string,
	senderPubkey: string,
	tags: string[][] = []
): Partial<NostrEvent> {
	return {
		kind: 4,
		content: ciphertext,
		tags: [['p', recipientPubkey], ...tags],
		pubkey: senderPubkey,
		created_at: Math.floor(Date.now() / 1000)
	};
}

async function parseDMEvent(
	event: NostrEvent,
	recipientPrivkey: string
): Promise<{ plaintext: string; senderPubkey: string }> {
	if (event.kind !== 4) throw new Error('Not a DM event');
	const senderPubkey = event.pubkey;
	const plaintext = await decryptDM(event.content, senderPubkey, recipientPrivkey);
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
		const { nsec, npub } = await getNostrKeyPair();
		const senderPrivkey = bytesToHex(nsec);
		const ciphertext = await encryptDM(message, recipientPubkey, senderPrivkey);
		const tags: string[][] = threadRootId ? [['e', threadRootId, '', 'root']] : [];
		const event = createDMEvent(ciphertext, recipientPubkey, npub, tags);

		const results = await withRetry(() => publishToMultipleRelays(DEFAULT_RELAYS, event));

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
	let pubkey: string;
	let unsub: (() => void) | null = null;
	let reconnectTimeout: NodeJS.Timeout | null = null;
	let isUnsubscribed = false;

	const setupConnection = async () => {
		if (isUnsubscribed) return;

		try {
			const { nsec, npub } = await getNostrKeyPair();
			privkey = bytesToHex(nsec);
			pubkey = npub;

			const filter: Filter = {
				kinds: [4],
				'#p': [pubkey],
				limit: 100
			};

			// Try primary relay first, then fallback to others
			for (const relay of DEFAULT_RELAYS) {
				if (isUnsubscribed) return;

				try {
					unsub = subscribeToEvents(relay, [filter], async (event: NostrEvent) => {
						try {
							const { plaintext, senderPubkey } = await parseDMEvent(event, privkey);
							callback({ plaintext, senderPubkey, event });
						} catch (err: unknown) {
							console.error('Failed to decrypt incoming message:', err);
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
		const pubkey = npub;

		const filter: Filter = {
			kinds: [4],
			authors: [withPubkey, pubkey],
			'#p': [withPubkey, pubkey],
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
		const pubkey = npub;

		const sentFilter: Filter = {
			kinds: [4],
			authors: [pubkey],
			limit: 1000 // adjust as needed for pagination
		};

		const receivedFilter: Filter = {
			kinds: [4],
			'#p': [pubkey],
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
			if (event.pubkey === pubkey) {
				// I am the sender, recipient is in p tag
				const pTag = event.tags.find((t) => t[0] === 'p');
				if (pTag && pTag[1]) otherPubkey = pTag[1];
			} else {
				// I am the recipient, sender is event.pubkey
				otherPubkey = event.pubkey;
			}

			if (!otherPubkey || otherPubkey === pubkey) continue;

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
