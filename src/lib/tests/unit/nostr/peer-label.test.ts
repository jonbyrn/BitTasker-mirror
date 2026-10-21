import { describe, expect, it } from 'vitest';
import { getPublicKey } from 'nostr-tools/pure';
import {
	conversationPeerLabel,
	peerLabelFromMetadata,
	shortenedPeerNpub
} from '$lib/nostr/profile/peer-label';

const HEX = getPublicKey(new Uint8Array(32).fill(7));

describe('conversation peer labels', () => {
	it('prefers a kind 0 display name, then a username, then a NIP-05 handle', () => {
		expect(peerLabelFromMetadata({ display_name: 'Ada Lovelace', name: 'ada' })).toBe(
			'Ada Lovelace'
		);
		expect(peerLabelFromMetadata({ username: 'ada_lovelace' })).toBe('ada_lovelace');
		expect(peerLabelFromMetadata({ nip05: 'ada@bittasker.com' })).toBe('ada@bittasker.com');
		expect(peerLabelFromMetadata({ name: HEX })).toBe('');
	});

	it('falls back to a shortened npub when no profile name is published', () => {
		const label = conversationPeerLabel({}, HEX);
		expect(label.startsWith('npub1')).toBe(true);
		expect(label).not.toContain(HEX.slice(0, 8));
		expect(shortenedPeerNpub(HEX)).toBe(label);
	});
});
