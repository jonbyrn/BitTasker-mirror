import type { NostrBidContent } from '$lib/types/bid';
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

		// Workaround to register published relay to ndk cache adapter
		this.on('relay:published', (relay) => {
			this.emit('published', relay);
		});
	}

	static async from(event: NDKEvent): Promise<NDKBid | undefined> {
		const bid = new NDKBid(event.ndk, event);

		const prevContent = bid.content;
		const sender = bid.author;
		try {
			await bid.decrypt(sender);
		} catch (_e) {
			d.error('decrypt error', { _e });
			bid.content ??= prevContent;
		}

		return bid;
	}

	async toNostrEvent(pubkey?: string): Promise<NostrEvent> {
		// encrypt content before signing
		const user = await this.ndk?.signer?.user();
		await this.encrypt(user, undefined, 'nip44');

		return super.toNostrEvent(pubkey) as unknown as NostrEvent;
	}

	get bidContent(): NostrBidContent {
		return JSON.parse(this.content) as unknown as NostrBidContent;
	}
}
