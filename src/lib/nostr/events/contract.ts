import { createDebug } from '$lib/utils/debug';
import NDK, { NDKEvent, NDKUser, type NostrEvent } from '@nostr-dev-kit/ndk';

const d = createDebug('ndk:events:contract');

/**
 * Contract class - represents kind 30006
 */
export class NDKEscrowContract extends NDKEvent {
	static kind = 30006;
	static kinds = [30006];

	constructor(ndk?: NDK, event?: NostrEvent | NDKEvent) {
		super(ndk, event);
		this.kind ??= 30006;
	}

	static async from(event: NDKEvent): Promise<NDKEscrowContract | undefined> {
		const contract = new NDKEscrowContract(event.ndk, event);

		const prevContent = contract.content;
		const sender = contract.author;
		const currentUserPubkey = contract.ndk?.activeUser?.pubkey;
		const otherPartyPubkey = contract
			.getMatchingTags('p')
			.find((tag) => tag[0] !== currentUserPubkey)[1];
		const otherUser = new NDKUser({ pubkey: otherPartyPubkey! });
		try {
			await contract.decrypt(otherUser);
			const isSenderCurrentUser = sender.pubkey === currentUserPubkey;
			d.log('decrypted contract', {
				contract,
				isSenderCurrentUser
			});
		} catch (_e) {
			d.error('decrypt error', { _e });
			contract.content ??= prevContent;
		}

		try {
			contract.content = JSON.parse(contract.content);

			// // Convert other fields to tags
			// contract.tags = [...contentTags, ...contract.tags];

			// // Set the actual message content
			// message.content = message.tagValue('content') || 'no content :(';
			// message.removeTag('content');
		} catch {
			return undefined;
		}

		return contract;
	}
}
