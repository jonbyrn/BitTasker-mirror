import { describe, expect, it } from 'vitest';
import { getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import type { Event } from 'nostr-tools';
import {
	hitsFromProfileEvents,
	profileMatchesQuery,
	recipientPubkey
} from '$lib/nostr/profile-search';

const SECRET = new Uint8Array(32).fill(7);
const HEX = getPublicKey(SECRET);
const NPUB = nip19.npubEncode(HEX);

function kind0(
	pubkey: string,
	content: Record<string, unknown>,
	created_at = 1_700_000_000
): Event {
	return {
		id: pubkey.slice(0, 64),
		pubkey,
		created_at,
		kind: 0,
		tags: [],
		content: JSON.stringify(content),
		sig: 'ab'.repeat(64)
	};
}

describe('new message profile search', () => {
	it('accepts a pasted npub and a hex public key', () => {
		expect(recipientPubkey(NPUB)).toBe(HEX);
		expect(recipientPubkey(`  ${NPUB}  `)).toBe(HEX);
		expect(recipientPubkey(HEX.toUpperCase())).toBe(HEX);
		expect(recipientPubkey('npub1not-valid')).toBeNull();
		expect(recipientPubkey('Ada Lovelace')).toBeNull();
	});

	it('matches a display name, a username, and an nip05 handle', () => {
		expect(profileMatchesQuery({ display_name: 'Ada Lovelace' }, 'ada lovelace')).toBe(true);
		expect(profileMatchesQuery({ display_name: 'Ada Lovelace' }, 'Lovelace')).toBe(true);
		expect(profileMatchesQuery({ username: 'ada_lovelace_abc123' }, 'ada lovelace')).toBe(true);
		expect(profileMatchesQuery({ name: 'ada' }, 'ada')).toBe(true);
		expect(profileMatchesQuery({ nip05: 'ada@bittasker.com' }, 'ada')).toBe(true);
		expect(profileMatchesQuery({ display_name: 'Ada Lovelace' }, 'satoshi')).toBe(false);
	});

	it('returns the known profile when the relay event uses display_name only', () => {
		const hits = hitsFromProfileEvents(
			[
				kind0('b'.repeat(64), { name: 'Someone Else' }),
				kind0(HEX, { display_name: 'Ada Lovelace', picture: 'https://example.com/a.png' })
			],
			'Ada'
		);
		expect(hits).toEqual([
			{
				pubkey: HEX,
				name: 'Ada Lovelace',
				picture: 'https://example.com/a.png'
			}
		]);
	});
});
