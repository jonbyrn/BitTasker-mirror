import { type NostrEvent } from '@nostr-dev-kit/ndk';
import { bytesToHex } from '@noble/hashes/utils';
import { nip04, nip19 } from 'nostr-tools';
import { ndk } from './ndk';
import { fetchProfileMetadata } from './profile';
import { publishNostrEvent, decryptDM } from '$lib/utils/nostr';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import KINDS from '$lib/utils/constants/kinds';

export interface ParsedDirectMessage {
	plaintext: string;
	senderPubkey: string;
	event: NostrEvent;
}

export async function sendDirectMessage(
	message: string,
	recipientPubkey: string,
	_threadRootId?: string,
	extraTags: string[][] = []
): Promise<NostrEvent> {
	if (!message.trim()) throw new Error('Message cannot be empty');
	const result = await publishNostrEvent(KINDS.DIRECT_MESSAGES, message, recipientPubkey, [
		['p', recipientPubkey],
		...extraTags
	]);
	return result.event;
}

export async function parseDMEvent(
	event: NostrEvent,
	_nsec: Uint8Array | string
): Promise<ParsedDirectMessage> {
	try {
		const { nsec, npub } = await getNostrKeyPair();
		const mine = hexPubkey(npub);

		let plaintext: string;
		if (event.pubkey === mine) {
			const recipientTag = event.tags.find((t) => t[0] === 'p');
			if (!recipientTag || !recipientTag[1]) {
				throw new Error('No recipient found in DM tags');
			}
			plaintext = await openDirectMessage(nsec, event.content, recipientTag[1]);
		} else {
			plaintext = await openDirectMessage(nsec, event.content, event.pubkey);
		}

		return { plaintext, senderPubkey: event.pubkey, event };
	} catch (error) {
		console.error('Failed to parse DM event:', error);
		throw error;
	}
}

async function openDirectMessage(
	nsec: Uint8Array,
	ciphertext: string,
	otherPubkey: string
): Promise<string> {
	try {
		return await decryptDM(nsec, ciphertext, otherPubkey);
	} catch {
		return nip04.decrypt(bytesToHex(nsec), otherPubkey, ciphertext);
	}
}

function hexPubkey(value: string): string {
	if (!value.startsWith('npub')) return value;
	try {
		const decoded = nip19.decode(value);
		return typeof decoded.data === 'string' ? decoded.data : value;
	} catch {
		return value;
	}
}

function otherParty(event: NostrEvent, mine: string): string {
	if (event.pubkey === mine) {
		return event.tags.find((tag) => tag[0] === 'p')?.[1] ?? '';
	}
	return event.pubkey;
}

async function loadDirectMessages(): Promise<NostrEvent[]> {
	const { npub } = await getNostrKeyPair();
	const mine = hexPubkey(npub);
	const [received, sent] = await Promise.all([
		ndk.fetchEvents(
			{ kinds: [KINDS.DIRECT_MESSAGES], '#p': [mine], limit: 100 },
			{ closeOnEose: true }
		),
		ndk.fetchEvents(
			{ kinds: [KINDS.DIRECT_MESSAGES], authors: [mine], limit: 100 },
			{ closeOnEose: true }
		)
	]);
	const seen = new Set<string>();
	const events: NostrEvent[] = [];
	for (const event of [...received, ...sent]) {
		const raw = event.rawEvent();
		if (seen.has(raw.id)) continue;
		seen.add(raw.id);
		events.push(raw);
	}
	return events.sort((left, right) => right.created_at - left.created_at);
}

export function listenForIncomingMessages(
	npub: string,
	nsec: Uint8Array,
	callback: (message: ParsedDirectMessage) => void
): () => void {
	const mine = hexPubkey(npub);
	const subscription = ndk.subscribe(
		{ kinds: [KINDS.DIRECT_MESSAGES], '#p': [mine] },
		{
			closeOnEose: false,
			onEvent: (event) => {
				void parseDMEvent(event.rawEvent(), nsec)
					.then(callback)
					.catch(() => undefined);
			}
		}
	);
	return () => subscription.stop();
}

export async function getMessageHistory(
	withPubkey: string,
	options: { limit?: number; since?: number; until?: number } = {}
): Promise<NostrEvent[]> {
	const { npub } = await getNostrKeyPair();
	const mine = hexPubkey(npub);
	const other = hexPubkey(withPubkey);
	const limit = options.limit ?? 100;
	const history = (await loadDirectMessages()).filter((event) => {
		if (otherParty(event, mine) !== other) return false;
		if (options.since != null && event.created_at < options.since) return false;
		if (options.until != null && event.created_at > options.until) return false;
		return true;
	});
	return history.slice(0, limit).sort((left, right) => left.created_at - right.created_at);
}

export async function getMessagedPeople(): Promise<
	{ pubkey: string; lastEvent: NostrEvent; profile: { name?: string; picture?: string } }[]
> {
	const { npub } = await getNostrKeyPair();
	const mine = hexPubkey(npub);
	const latest = new Map<string, NostrEvent>();
	for (const event of await loadDirectMessages()) {
		const pubkey = otherParty(event, mine);
		if (!pubkey || pubkey === mine || latest.has(pubkey)) continue;
		latest.set(pubkey, event);
	}

	const people = await Promise.all(
		[...latest.entries()].map(async ([pubkey, lastEvent]) => {
			try {
				const profile = await fetchProfileMetadata(pubkey);
				return { pubkey, lastEvent, profile: profile ?? {} };
			} catch {
				return { pubkey, lastEvent, profile: {} };
			}
		})
	);
	return people;
}
