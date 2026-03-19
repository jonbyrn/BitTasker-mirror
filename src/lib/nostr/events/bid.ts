import { createDebug } from '$lib/utils/debug';
import NDK, { NDKEvent, type NostrEvent } from '@nostr-dev-kit/ndk';

const d = createDebug('ndk:events:bid');

/**
 * bid class - represents kind 30007
 */
export class NDKBid extends NDKEvent {
	static kind = 30007;
	static kinds = [30007];

	constructor(ndk?: NDK, event?: NostrEvent | NDKEvent) {
		super(ndk, event);
		this.kind ??= 30007;
	}

	static async from(event: NDKEvent): Promise<NDKEvent | undefined> {
		const bid = new NDKBid(event.ndk, event);

		const prevContent = bid.content;
		const sender = bid.author;
		try {
			await bid.decrypt(sender);
			d.log('decrypted bid', {
				bid
			});
		} catch (_e) {
			d.error('decrypt error', { _e });
			bid.content ??= prevContent;
		}

		try {
			bid.content = JSON.parse(bid.content);

			// // Convert other fields to tags
			// bid.tags = [...contentTags, ...bid.tags];

			// // Set the actual message content
			// message.content = message.tagValue('content') || 'no content :(';
			// message.removeTag('content');
		} catch {
			return undefined;
		}

		return bid;
	}
}
