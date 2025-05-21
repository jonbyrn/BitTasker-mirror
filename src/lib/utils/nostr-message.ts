import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { nip04 } from 'nostr-tools';
import { getNostrKeyPair } from './nostrKeys';
import { bytesToHex } from '@noble/hashes/utils';
import { publishEvent, subscribeToEvents } from './nostr';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { appStore } from '$lib/stores/app.store';

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
	const pool = (await import('nostr-tools/pool')).SimplePool;
	const relayPool = new pool();
	const filter: Filter = {
		kinds: [0, 1063],
		authors: [pubkey],
		limit: 10
	};
	const events: NostrEvent[] = await relayPool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
	let name: string | undefined = undefined;
	let picture: string | undefined = undefined;
	for (const event of events) {
		if (event.kind === 0 && event.content) {
			try {
				const content = JSON.parse(event.content);
				name = content.name;
				picture = content.picture;
			} catch (e) {
				console.error(e);
			}
		} else if (event.kind === 1063) {
			const urlTag = event.tags.find((t) => t[0] === 'url');
			if (urlTag && urlTag[1]) {
				picture = urlTag[1];
			}
		}
	}
	return { name, picture };
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
		await publishEvent(event, PUBLIC_NOSTR_RELAY_URL);
	} catch (err: unknown) {
		appStore.showErrorToast((err as Error)?.message || 'Failed to send message');
		throw err;
	}
}

/**
 * Listen for incoming DMs for the current user
 * Returns an unsubscribe function
 */
export function listenForIncomingMessages(
	callback: (msg: { plaintext: string; senderPubkey: string; event: NostrEvent }) => void
): () => void {
	let privkey: string;
	let pubkey: string;
	let unsub: (() => void) | null = null;
	getNostrKeyPair().then(({ nsec, npub }) => {
		privkey = bytesToHex(nsec);
		pubkey = npub;
		const filter: Filter = {
			kinds: [4],
			'#p': [pubkey],
			limit: 100
		};
		unsub = subscribeToEvents(PUBLIC_NOSTR_RELAY_URL, [filter], async (event: NostrEvent) => {
			try {
				const { plaintext, senderPubkey } = await parseDMEvent(event, privkey);
				callback({ plaintext, senderPubkey, event });
			} catch (err: unknown) {
				appStore.showErrorToast((err as Error)?.message || 'Failed to decrypt incoming message');
			}
		});
	});
	return () => {
		if (unsub) unsub();
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
		const pool = (await import('nostr-tools/pool')).SimplePool;
		const relayPool = new pool();
		const events: NostrEvent[] = await relayPool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
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
		appStore.showErrorToast((err as Error)?.message || 'Failed to fetch message history');
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
		const pool = (await import('nostr-tools/pool')).SimplePool;
		const relayPool = new pool();
		const events: NostrEvent[] = await relayPool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
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
		appStore.showErrorToast((err as Error)?.message || 'Failed to fetch thread messages');
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
		const filter: Filter = {
			kinds: [4],
			authors: [pubkey],
			limit: 1000 // adjust as needed for pagination
		};
		const pool = (await import('nostr-tools/pool')).SimplePool;
		const relayPool = new pool();
		// Fetch sent messages
		const sentEvents: NostrEvent[] = await relayPool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
		// Fetch received messages
		const receivedFilter: Filter = {
			kinds: [4],
			'#p': [pubkey],
			limit: 1000
		};
		const receivedEvents: NostrEvent[] = await relayPool.querySync(
			[PUBLIC_NOSTR_RELAY_URL],
			receivedFilter
		);
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
		// Fetch profiles in parallel using our new private function
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
					console.error(e);
				}
				return { pubkey, lastEvent, profile };
			})
		);
		return results;
	} catch (err: unknown) {
		appStore.showErrorToast((err as Error)?.message || 'Failed to fetch messaged people');
		throw err;
	}
}
