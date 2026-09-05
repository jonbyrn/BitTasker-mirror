import { NDKEvent, NDKUser, type NostrEvent } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';
import { publishNostrEvent } from '$lib/utils/nostr';
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
	const ndkEvent = new NDKEvent(ndk, event);
	await ndkEvent.decrypt(new NDKUser({ pubkey: event.pubkey }), undefined, 'nip44');
	return { plaintext: ndkEvent.content, senderPubkey: event.pubkey, event };
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
