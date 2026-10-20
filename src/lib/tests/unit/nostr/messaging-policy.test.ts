import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.hoisted(() => vi.fn());
const mockKeys = vi.hoisted(() => vi.fn());

vi.mock('$lib/nostr/relaySession', () => ({
	messageRelayUrls: () => ['wss://messages.example'],
	queryRelaysDetailed: (...args: unknown[]) => mockQuery(...args)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: (...args: unknown[]) => mockKeys(...args)
}));

import {
	MESSAGE_LOCKED_NOTE,
	assertChatAllowed,
	assertNoOffPlatformContact,
	clearMessagingAllowanceCache,
	offPlatformContact,
	pairHasFormedEscrow
} from '$lib/nostr/messaging-policy';

const self = 'a'.repeat(64);
const other = 'b'.repeat(64);

describe('messaging policy', () => {
	beforeEach(() => {
		clearMessagingAllowanceCache();
		mockKeys.mockResolvedValue({ nsec: new Uint8Array(32), npub: self });
		mockQuery.mockResolvedValue({ events: [], relays: [] });
	});

	it('treats locked and funded contracts as formed escrow', () => {
		expect(
			pairHasFormedEscrow(
				[
					{
						pubkey: self,
						tags: [
							['p', other],
							['s', 'funded']
						]
					}
				],
				self,
				other
			)
		).toBe(true);
		expect(
			pairHasFormedEscrow(
				[
					{
						pubkey: self,
						tags: [
							['p', other],
							['s', 'ESCROW_FUNDED']
						]
					}
				],
				self,
				other
			)
		).toBe(true);
		expect(
			pairHasFormedEscrow(
				[
					{
						pubkey: self,
						tags: [
							['p', other],
							['s', 'ACCEPTED']
						]
					}
				],
				self,
				other
			)
		).toBe(false);
	});

	it('flags contact details that would move work off the platform', () => {
		expect(offPlatformContact('email me at ada@example.com')).toBe('an email address');
		expect(offPlatformContact('call +1 415 555 0134')).toBe('a phone number');
		expect(offPlatformContact('see https://t.me/ada')).toBe('an outside link');
		expect(offPlatformContact('ping me on telegram')).toBe('an outside handle');
		expect(offPlatformContact('details are on https://bittasker.com/tasks/1')).toBeNull();
		expect(() => assertNoOffPlatformContact('ada@example.com')).toThrow(MESSAGE_LOCKED_NOTE);
	});

	it('blocks free chat until a formed escrow names both people', async () => {
		await expect(assertChatAllowed(other)).rejects.toThrow(MESSAGE_LOCKED_NOTE);
		expect(mockQuery).toHaveBeenCalled();

		clearMessagingAllowanceCache();
		mockQuery.mockResolvedValue({
			events: [
				{
					pubkey: self,
					kind: 31006,
					tags: [
						['p', other],
						['s', 'locked']
					],
					id: '1'
				}
			],
			relays: [{ url: 'wss://messages.example', ok: true, reason: 'ok' }]
		});
		await expect(assertChatAllowed(other)).resolves.toBeUndefined();
	});

	it('fails closed when the escrow relays cannot be read', async () => {
		mockQuery.mockRejectedValue(new Error('timed out'));
		await expect(assertChatAllowed(other)).rejects.toThrow(MESSAGE_LOCKED_NOTE);
	});
});
