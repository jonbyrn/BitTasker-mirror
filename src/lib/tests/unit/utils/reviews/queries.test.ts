import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';

const subscribeMock = vi.hoisted(() =>
	vi.fn(() => ({
		on: (event: string, cb: () => void) => {
			if (event === 'eose') {
				queueMicrotask(cb);
			}
		},
		start: vi.fn()
	}))
);

vi.mock('$lib/nostr/relayQuery', () => ({
	queryRelayEvents: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		subscribe: subscribeMock,
		fetchEvent: vi.fn()
	}
}));

import { getReviewsForUser } from '$lib/utils/reviews/queries';

describe('getReviewsForUser', () => {
	beforeEach(() => {
		subscribeMock.mockClear();
	});

	it('normalizes npub to hex for attestation #p filter', async () => {
		const hexPubkey = 'c'.repeat(64);
		const npub = nip19.npubEncode(hexPubkey);

		await getReviewsForUser(npub, 10);

		expect(subscribeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				'#p': [hexPubkey.toLowerCase()]
			}),
			expect.objectContaining({ closeOnEose: true })
		);
	});
});
