import { type NostrEvent } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';
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

		let plaintext: string;
		if (event.pubkey === npub) {
			// We are the sender, decrypt with recipient's pubkey from tags
			const recipientTag = event.tags.find((t) => t[0] === 'p');
			if (!recipientTag || !recipientTag[1]) {
				throw new Error('No recipient found in DM tags');
			}
			plaintext = await decryptDM(nsec, event.content, recipientTag[1]);
		} else {
			// We are the recipient, decrypt with sender's pubkey
			plaintext = await decryptDM(nsec, event.content, event.pubkey);
		}

		return { plaintext, senderPubkey: event.pubkey, event };
	} catch (error) {
		console.error('Failed to parse DM event:', error);
		throw error;
	}
}

export function listenForIncomingMessages(
	npub: string,
	nsec: Uint8Array,
	callback: (message: ParsedDirectMessage) => void
): () => void {
	const subscription = ndk.subscribe(
		{ kinds: [KINDS.DIRECT_MESSAGES], '#p': [npub] },
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
	_withPubkey: string,
	_options: { limit?: number; since?: number; until?: number } = {}
): Promise<NostrEvent[]> {
	return [];
}

export async function getMessagedPeople(): Promise<
	{ pubkey: string; lastEvent: NostrEvent; profile: { name?: string; picture?: string } }[]
> {
	return [];
}
