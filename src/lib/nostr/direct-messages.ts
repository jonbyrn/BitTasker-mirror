import { type NostrEvent } from '@nostr-dev-kit/ndk';
import { bytesToHex } from '@noble/hashes/utils';
import { nip04 } from 'nostr-tools';
import { fetchProfileMetadata } from './profile';
import { publishNostrEvent, decryptDM } from '$lib/utils/nostr';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import KINDS from '$lib/utils/constants/kinds';
import { assertChatAllowed, toHexPubkey } from '$lib/nostr/messaging-policy';
import {
	clarifyDeliveryFailure,
	messageRelayUrls,
	queryRelaysDetailed,
	subscribeRelayEvents
} from '$lib/nostr/relaySession';

export interface ParsedDirectMessage {
	plaintext: string;
	senderPubkey: string;
	event: NostrEvent;
}

export type DirectMessagePurpose = 'chat' | 'protocol';

export async function sendDirectMessage(
	message: string,
	recipientPubkey: string,
	_threadRootId?: string,
	extraTags: string[][] = [],
	purpose: DirectMessagePurpose = 'chat'
): Promise<NostrEvent> {
	if (!message.trim()) throw new Error('Message cannot be empty');
	const recipientHex = toHexPubkey(recipientPubkey);
	if (!recipientHex) throw new Error('That public key is not valid.');
	if (purpose !== 'protocol') await assertChatAllowed(recipientHex);

	const relays = messageRelayUrls();
	if (relays.length === 0) throw new Error('No message relay is configured.');

	try {
		const result = await publishNostrEvent(
			KINDS.DIRECT_MESSAGES,
			message,
			recipientHex,
			[['p', recipientHex], ['m', 'direct-message'], ...extraTags],
			relays
		);
		return result.event;
	} catch (error) {
		if (error instanceof Error && error.name === 'SignerLockedError') throw error;
		const text = error instanceof Error ? error.message : 'Message was not delivered.';
		throw new Error(clarifyDeliveryFailure(text, relays));
	}
}

export async function parseDMEvent(
	event: NostrEvent,
	_nsec: Uint8Array | string,
	_viewer?: string
): Promise<ParsedDirectMessage> {
	try {
		const { nsec, npub } = await getNostrKeyPair();
		const mine = toHexPubkey(npub);

		let plaintext: string;
		if (mine && event.pubkey.toLowerCase() === mine) {
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

function otherParty(event: NostrEvent, mine: string): string {
	if (event.pubkey.toLowerCase() === mine) {
		return toHexPubkey(event.tags.find((tag) => tag[0] === 'p')?.[1] ?? '');
	}
	return toHexPubkey(event.pubkey);
}

function relayFailure(relays: { url: string; ok: boolean; reason: string }[]): string | null {
	if (relays.length === 0 || relays.some((relay) => relay.ok)) return null;
	const detail = relays
		.map((relay) => `${relay.url || 'message relay'}: ${relay.reason}`)
		.join('; ');
	return `Messages could not be loaded. ${detail}`;
}

async function loadDirectMessages(): Promise<NostrEvent[]> {
	const { npub } = await getNostrKeyPair();
	const mine = toHexPubkey(npub);
	if (!mine) {
		throw new Error('Your signing key is not a valid public key, so messages cannot be loaded.');
	}
	const relays = messageRelayUrls();
	if (relays.length === 0) throw new Error('No message relay is configured.');

	const report = await queryRelaysDetailed(relays, [
		{ kinds: [KINDS.DIRECT_MESSAGES], '#p': [mine], limit: 100 },
		{ kinds: [KINDS.DIRECT_MESSAGES], authors: [mine], limit: 100 }
	]);
	const failure = relayFailure(report.relays);
	if (failure) throw new Error(failure);

	const seen = new Set<string>();
	const events: NostrEvent[] = [];
	for (const raw of report.events) {
		if (seen.has(raw.id)) continue;
		seen.add(raw.id);
		events.push(raw as NostrEvent);
	}
	return events.sort((left, right) => right.created_at - left.created_at);
}

export function listenForIncomingMessages(
	npub: string,
	nsec: Uint8Array,
	callback: (message: ParsedDirectMessage) => void,
	onFailure?: (message: string) => void
): () => void {
	const mine = toHexPubkey(npub);
	if (!mine) {
		onFailure?.('Your signing key is not a valid public key, so messages cannot be loaded.');
		return () => undefined;
	}
	const relays = messageRelayUrls();
	if (relays.length === 0) {
		onFailure?.('No message relay is configured.');
		return () => undefined;
	}

	const failed = new Map<string, string>();
	return subscribeRelayEvents(
		relays,
		[
			{ kinds: [KINDS.DIRECT_MESSAGES], '#p': [mine] },
			{ kinds: [KINDS.DIRECT_MESSAGES], authors: [mine] }
		],
		(event) => {
			void parseDMEvent(event as NostrEvent, nsec)
				.then(callback)
				.catch(() => undefined);
		},
		(url, reason) => {
			failed.set(url, reason);
			if (failed.size < relays.length) return;
			const detail = [...failed.entries()]
				.map(([relay, why]) => `${relay || 'message relay'}: ${why}`)
				.join('; ');
			onFailure?.(`Messages could not be loaded. ${detail}`);
		}
	);
}

export async function getMessageHistory(
	withPubkey: string,
	options: { limit?: number; since?: number; until?: number } = {}
): Promise<NostrEvent[]> {
	if (messageRelayUrls().length === 0) return [];
	const { npub } = await getNostrKeyPair();
	const mine = toHexPubkey(npub);
	const other = toHexPubkey(withPubkey);
	if (!mine || !other) throw new Error('That public key is not valid.');
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
	const mine = toHexPubkey(npub);
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
