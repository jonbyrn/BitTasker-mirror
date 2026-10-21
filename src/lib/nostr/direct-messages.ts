import { type NostrEvent } from '@nostr-dev-kit/ndk';
import { bytesToHex } from '@noble/hashes/utils';
import { nip04 } from 'nostr-tools';
import { fetchProfileMetadata } from './profile';
import { publishNostrEvent, decryptDM } from '$lib/utils/nostr';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import KINDS from '$lib/utils/constants/kinds';
import {
	ContactBlockedError,
	inspectOutgoingMessage,
	isContactBlockedError
} from '$lib/config/contact-filter';
import { escrowFormedForPair, toHexPubkey } from '$lib/nostr/messaging-policy';
import {
	clarifyDeliveryFailure,
	messageRelayUrls,
	queryRelaysDetailed,
	relaysForDirectMessages,
	subscribeRelayEvents
} from '$lib/nostr/relaySession';

export { ContactBlockedError, isContactBlockedError };

const PROTOCOL_MESSAGE_TYPES = new Set(['location', 'task-completion', 'payment-released']);

function usesPostEscrowFilter(extraTags: string[][], purpose: DirectMessagePurpose): boolean {
	if (purpose === 'protocol') return true;
	return extraTags.some((tag) => tag[0] === 'm' && PROTOCOL_MESSAGE_TYPES.has(tag[1] ?? ''));
}

/**
 * Blocks off-platform contact in user chat. Does not close the thread.
 * Protocol DMs (location, completion, payment, and purpose `protocol`) use the
 * post-escrow rules so a maps link still sends, while handles and app names stay blocked.
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
	const formed = await escrowFormedForPair(self, recipientPubkey);
	if (!formed) {
		throw new ContactBlockedError(pre.category);
	}
}

export interface ParsedDirectMessage {
	plaintext: string;
	senderPubkey: string;
	event: NostrEvent;
}

export type DirectMessagePurpose = 'chat' | 'protocol';

function labelFromProfile(raw: { name?: unknown; display_name?: unknown }): string {
	if (typeof raw.name === 'string' && raw.name.trim()) return raw.name.trim();
	if (typeof raw.display_name === 'string' && raw.display_name.trim()) return raw.display_name.trim();
	return '';
}

/** A missing profile does not block a chat. A relay timeout returns an empty name. */
export async function lookupChatProfile(
	pubkey: string
): Promise<{ name?: string; picture?: string }> {
	const hex = toHexPubkey(pubkey);
	if (!hex) return {};
	const cached = await Promise.race([
		fetchProfileMetadata(hex).catch(() => ({})),
		new Promise<{ name?: string; picture?: string }>((resolve) => {
			setTimeout(() => resolve({}), 4000);
		})
	]);
	const named = labelFromProfile(cached);
	if (named) {
		return {
			name: named,
			picture: typeof cached.picture === 'string' ? cached.picture : undefined
		};
	}
	try {
		const report = await queryRelaysDetailed(
			messageRelayUrls(),
			[{ kinds: [0], authors: [hex], limit: 1 }],
			4000
		);
		const event = [...report.events].sort((left, right) => right.created_at - left.created_at)[0];
		if (!event?.content) return {};
		const raw = JSON.parse(event.content) as {
			name?: unknown;
			display_name?: unknown;
			picture?: unknown;
		};
		const name = labelFromProfile(raw);
		if (!name) return {};
		return { name, picture: typeof raw.picture === 'string' ? raw.picture : undefined };
	} catch (error: unknown) {
		console.warn(
			'[messages] profile lookup failed',
			error instanceof Error ? error.message : error
		);
		return {};
	}
}

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
	if (usesPostEscrowFilter(extraTags, purpose)) {
		const protocolCheck = inspectOutgoingMessage(message, 'post-escrow');
		if (protocolCheck.blocked && protocolCheck.category) {
			throw new ContactBlockedError(protocolCheck.category);
		}
	} else {
		await assertDirectMessageAllowed(message, recipientHex);
	}

	const { npub } = await getNostrKeyPair();
	const relays = await relaysForDirectMessages(
		[toHexPubkey(npub), recipientHex].filter((pubkey) => pubkey !== '')
	);
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
		if (isContactBlockedError(error)) throw error;
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
	const relays = await relaysForDirectMessages([mine]);
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

	const expected = new Set(relays);
	const failed = new Map<string, string>();
	const stops: Array<() => void> = [];
	const filters = [
		{ kinds: [KINDS.DIRECT_MESSAGES], '#p': [mine] },
		{ kinds: [KINDS.DIRECT_MESSAGES], authors: [mine] }
	];
	const reportIfAllFailed = () => {
		if ([...expected].some((url) => !failed.has(url))) return;
		const detail = [...failed.entries()]
			.map(([relay, why]) => `${relay || 'message relay'}: ${why}`)
			.join('; ');
		onFailure?.(`Messages could not be loaded. ${detail}`);
	};
	const attach = (urls: string[]) => {
		stops.push(
			subscribeRelayEvents(
				urls,
				filters,
				(event) => {
					void parseDMEvent(event as NostrEvent, nsec)
						.then(callback)
						.catch(() => undefined);
				},
				(url, reason) => {
					failed.set(url, reason);
					reportIfAllFailed();
				}
			)
		);
	};
	attach(relays);
	void relaysForDirectMessages([mine])
		.then((full) => {
			const extra = full.filter((url) => !expected.has(url));
			for (const url of extra) expected.add(url);
			if (extra.length > 0) attach(extra);
		})
		.catch((error: unknown) => {
			console.warn(
				'[messages] live inbox relays failed',
				error instanceof Error ? error.message : error
			);
		});
	return () => {
		for (const stop of stops) stop();
	};
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
