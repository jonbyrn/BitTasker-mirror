import type { Event as NostrEvent } from 'nostr-tools';
import { NDKRelaySet, type NDKFilter, type NDKSubscription } from '@nostr-dev-kit/ndk';
import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
import { bytesToHex } from '@noble/hashes/utils';
import { appStore } from '$lib/stores/app.store';
import { fetchProfilesBatch } from '$lib/nostr/profile/display-profile';
import { publishSignedNdkEvent } from '$lib/nostr/profile/ndk';
import { normalizeProfileLookupKey, profileRelays } from '$lib/nostr/profile/profile-keys';
import { TAG_FILTERS, TAG_PATTERNS } from '$lib/utils/constants/tags';
import nip44 from '$lib/nostr/nip44';
import KINDS from '$lib/utils/constants/kinds';
import { ndk } from '$lib/nostr/ndk';
import {
	ContactBlockedError,
	inspectOutgoingMessage,
	isContactBlockedError
} from '$lib/config/contact-filter';
import { pairEscrowIsFormed } from '$lib/nostr/escrow-formed';

export { ContactBlockedError, isContactBlockedError };

const PROTOCOL_MESSAGE_TYPES = new Set(['location', 'task-completion', 'payment-released']);

function isProtocolMessage(additionalTags?: string[][]): boolean {
	return (additionalTags ?? []).some(
		(tag) => tag[0] === 'm' && PROTOCOL_MESSAGE_TYPES.has(tag[1] ?? '')
	);
}

/**
 * Blocks off-platform contact in user chat. Does not close the thread.
 * Protocol DMs (location, completion, payment) use the post-escrow rules so a
 * maps link still sends, while handles and app names stay blocked.
 */
export async function assertDirectMessageAllowed(
	message: string,
	recipientPubkey: string,
	selfPubkey?: string
): Promise<void> {
	const pre = inspectOutgoingMessage(message, 'pre-escrow');
	if (!pre.blocked || !pre.category) return;

	const post = inspectOutgoingMessage(message, 'post-escrow');
	if (post.blocked && post.category) {
		throw new ContactBlockedError(post.category);
	}

	const self = selfPubkey ?? (await getNostrKeyPair()).npub;
	const formed = await pairEscrowIsFormed(self, recipientPubkey);
	if (!formed) {
		throw new ContactBlockedError(pre.category);
	}
}

const DM_LOOKBACK_SECONDS = 7 * 24 * 60 * 60;

function messageRelays(): string[] {
	const relays = profileRelays();
	if (relays.length > 0) {
		return relays;
	}
	return [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean) as string[];
}

async function encryptDM(
	plaintext: string,
	recipientHex: string,
	senderPrivkey: string
): Promise<string> {
	const nonce = crypto.getRandomValues(new Uint8Array(32));
	const conversationKey = await nip44.getConversationKey(senderPrivkey, recipientHex);
	return nip44.encrypt(plaintext, conversationKey, nonce);
}

async function decryptDM(
	ciphertext: string,
	senderHex: string,
	recipientNsec: string
): Promise<string> {
	const conversationKey = await nip44.getConversationKey(recipientNsec, senderHex);
	return nip44.decrypt(ciphertext, conversationKey);
}

export async function parseDMEvent(
	event: NostrEvent,
	nsec: string,
	npub: string
): Promise<{ plaintext: string; senderPubkey: string }> {
	if (event.kind !== KINDS.DIRECT_MESSAGES) {
		throw new Error('Not a DM event');
	}

	const senderPubkey = event.pubkey;
	const { hexPubkey: selfHex } = normalizeProfileLookupKey(npub);

	let plaintext: string;

	if (senderPubkey === selfHex) {
		const recipientTag = event.tags.find((tag) => tag[0] === 'p');
		if (!recipientTag?.[1]) {
			throw new Error('No recipient found in message tags');
		}
		const { hexPubkey: recipientHex } = normalizeProfileLookupKey(recipientTag[1]);
		plaintext = await decryptDM(event.content, recipientHex, nsec);
	} else {
		plaintext = await decryptDM(event.content, senderPubkey, nsec);
	}

	return { plaintext, senderPubkey: senderPubkey };
}

export async function sendDirectMessage(
	message: string,
	recipientPubkey: string,
	threadRootId?: string,
	additionalTags?: string[][]
): Promise<void> {
	const { nsec, npub } = await getNostrKeyPair();
	const senderPrivkey = bytesToHex(nsec);
	const { hexPubkey: recipientHex } = normalizeProfileLookupKey(recipientPubkey);
	if (!recipientHex) {
		throw new Error('Invalid recipient pubkey');
	}

	if (isProtocolMessage(additionalTags)) {
		const protocolCheck = inspectOutgoingMessage(message, 'post-escrow');
		if (protocolCheck.blocked && protocolCheck.category) {
			throw new ContactBlockedError(protocolCheck.category);
		}
	} else {
		await assertDirectMessageAllowed(message, recipientHex, npub);
	}

	try {
		const ciphertext = await encryptDM(message, recipientHex, senderPrivkey);
		const tags: string[][] = [...TAG_PATTERNS.directMessage(recipientHex)];

		if (threadRootId) {
			tags.push(['e', threadRootId, '', 'root']);
		}
		if (additionalTags?.length) {
			tags.push(...additionalTags);
		}

		await publishSignedNdkEvent(KINDS.DIRECT_MESSAGES, ciphertext, tags, messageRelays());
	} catch (err: unknown) {
		if (isContactBlockedError(err)) throw err;
		const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}

function startDmSubscription(
	filters: NDKFilter[],
	onEvent: (event: NostrEvent) => void
): NDKSubscription[] {
	return filters.map((filter) =>
		ndk.subscribe(filter, {
			closeOnEose: false,
			onEvent: async (ndkEvent) => {
				try {
					const event = (await ndkEvent.toNostrEvent()) as NostrEvent;
					onEvent(event);
				} catch (error) {
					console.error('Failed to convert NDK DM event:', error);
				}
			}
		})
	);
}

export function listenForIncomingMessages(
	npub: string,
	nsec: Uint8Array,
	callback: (msg: { plaintext: string; senderPubkey: string; event: NostrEvent }) => void
): () => void {
	const { hexPubkey } = normalizeProfileLookupKey(npub);
	if (!hexPubkey) {
		return () => {};
	}

	const privkey = bytesToHex(nsec);
	const since = Math.floor(Date.now() / 1000) - DM_LOOKBACK_SECONDS;

	const subs = startDmSubscription(
		[
			{
				kinds: [KINDS.DIRECT_MESSAGES],
				'#p': [hexPubkey],
				...TAG_FILTERS.byMessageType('direct-message'),
				since
			},
			{
				kinds: [KINDS.DIRECT_MESSAGES],
				authors: [hexPubkey],
				since
			}
		],
		(event) => {
			parseDMEvent(event, privkey, npub)
				.then(({ plaintext, senderPubkey }) => {
					callback({ plaintext, senderPubkey, event });
				})
				.catch((err: unknown) => {
					if (err instanceof Error && !err.message.includes('Invalid MAC')) {
						console.error('Failed to decrypt message:', err);
					}
				});
		}
	);

	return () => {
		for (const sub of subs) {
			sub.stop();
		}
	};
}

async function fetchDmEvents(filters: NDKFilter[]): Promise<NostrEvent[]> {
	const relays = messageRelays();
	if (relays.length === 0) {
		return [];
	}

	const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
	const events: NostrEvent[] = [];

	for (const filter of filters) {
		const ndkEvents = await ndk.fetchEvents(filter, { closeOnEose: true, relaySet });
		for (const ev of ndkEvents) {
			events.push((await ev.toNostrEvent()) as NostrEvent);
		}
	}

	return events;
}

export async function getMessageHistory(
	withPubkey: string,
	options?: { limit?: number; since?: number; until?: number }
): Promise<{ plaintext: string; senderPubkey: string; event: NostrEvent }[]> {
	try {
		const { nsec, npub } = await getNostrKeyPair();
		const privkey = bytesToHex(nsec);
		const { hexPubkey: selfHex } = normalizeProfileLookupKey(npub);
		const { hexPubkey: withHex } = normalizeProfileLookupKey(withPubkey);
		if (!selfHex || !withHex) {
			return [];
		}

		const events = await fetchDmEvents([
			{
				kinds: [KINDS.DIRECT_MESSAGES],
				authors: [withHex, selfHex],
				'#p': [withHex, selfHex],
				...TAG_FILTERS.byMessageType('direct-message'),
				limit: options?.limit ?? 25,
				...(options?.since ? { since: options.since } : {}),
				...(options?.until ? { until: options.until } : {})
			}
		]);

		const decrypted = await Promise.all(
			events.map(async (event) => {
				try {
					const { plaintext, senderPubkey } = await parseDMEvent(event, privkey, npub);
					return { plaintext, senderPubkey, event };
				} catch (error) {
					if (error instanceof Error && !error.message.includes('Invalid MAC')) {
						console.error('Failed to decrypt event:', error);
					}
					return null;
				}
			})
		);

		return decrypted.filter((row): row is NonNullable<typeof row> => row !== null);
	} catch (err: unknown) {
		console.error('getMessageHistory error:', err);
		const errorMessage = err instanceof Error ? err.message : 'Failed to fetch message history';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}

export async function getMessagedPeople(): Promise<
	{ pubkey: string; lastEvent: NostrEvent; profile: { name?: string; picture?: string } }[]
> {
	try {
		const npub = await getNpub();
		const { hexPubkey: selfHex } = normalizeProfileLookupKey(npub);
		if (!selfHex) {
			return [];
		}

		const [sentEvents, receivedEvents] = await Promise.all([
			fetchDmEvents([
				{
					kinds: [KINDS.DIRECT_MESSAGES],
					authors: [selfHex],
					...TAG_FILTERS.byMessageType('direct-message'),
					limit: 1000
				}
			]),
			fetchDmEvents([
				{
					kinds: [KINDS.DIRECT_MESSAGES],
					'#p': [selfHex],
					...TAG_FILTERS.byMessageType('direct-message'),
					limit: 1000
				}
			])
		]);

		const peopleMap = new Map<string, NostrEvent>();
		for (const event of [...sentEvents, ...receivedEvents]) {
			const otherPubkey =
				event.pubkey === selfHex ? event.tags.find((t) => t[0] === 'p')?.[1] : event.pubkey;

			if (!otherPubkey || otherPubkey === selfHex) continue;

			const existing = peopleMap.get(otherPubkey);
			if (!existing || event.created_at > existing.created_at) {
				peopleMap.set(otherPubkey, event);
			}
		}

		const allPubkeys = Array.from(peopleMap.keys());
		const profiles = await fetchProfilesBatch(allPubkeys);

		return Array.from(peopleMap.entries()).map(([pubkey, lastEvent]) => ({
			pubkey,
			lastEvent,
			profile: profiles.get(normalizeProfileLookupKey(pubkey).hexPubkey) || {
				name: `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`
			}
		}));
	} catch (err: unknown) {
		const errorMessage = err instanceof Error ? err.message : 'Failed to fetch messaged people';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}
