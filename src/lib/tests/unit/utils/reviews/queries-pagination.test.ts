import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';

const subscribeMock = vi.hoisted(() =>
	vi.fn(() => ({
		on: (event: string, cb: (...args: unknown[]) => void) => {
			if (event === 'eose') {
				queueMicrotask(cb);
			}
		},
		start: vi.fn()
	}))
);

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		subscribe: subscribeMock,
		fetchEvent: vi.fn()
	}
}));

import { getReviewsForUser, getReviewsByReviewer } from '$lib/utils/reviews/queries';

describe('Review pagination with until cursor', () => {
	beforeEach(() => {
		subscribeMock.mockClear();
	});

	describe('getReviewsForUser', () => {
		it('returns { reviews, cursor } shape instead of plain array', async () => {
			const hexPubkey = 'a'.repeat(64);
			const result = await getReviewsForUser(hexPubkey, 10);

			expect(result).toHaveProperty('reviews');
			expect(result).toHaveProperty('cursor');
			expect(Array.isArray(result.reviews)).toBe(true);
		});

		it('does not set until filter when before parameter is omitted', async () => {
			const hexPubkey = 'b'.repeat(64);
			await getReviewsForUser(hexPubkey, 10);

			const calledFilter = subscribeMock.mock.calls[0][0];
			expect(calledFilter.until).toBeUndefined();
		});

		it('sets until filter when before parameter is provided', async () => {
			const hexPubkey = 'c'.repeat(64);
			const beforeTs = 1700000000;
			await getReviewsForUser(hexPubkey, 10, beforeTs);

			const calledFilter = subscribeMock.mock.calls[0][0];
			expect(calledFilter.until).toBe(beforeTs);
		});

		it('returns cursor as null when no reviews', async () => {
			const hexPubkey = 'd'.repeat(64);
			const result = await getReviewsForUser(hexPubkey, 10);

			expect(result.cursor).toBeNull();
		});

		it('normalizes npub to hex for attestation #p filter', async () => {
			const hexPubkey = 'e'.repeat(64);
			const npub = nip19.npubEncode(hexPubkey);

			await getReviewsForUser(npub, 10);

			expect(subscribeMock).toHaveBeenCalledWith(
				expect.objectContaining({
					'#p': [hexPubkey.toLowerCase()]
				}),
				expect.objectContaining({ closeOnEose: true })
			);
		});

		it('returns empty reviews and null cursor for invalid pubkey', async () => {
			const result = await getReviewsForUser('invalid', 10);

			expect(result.reviews).toEqual([]);
			expect(result.cursor).toBeNull();
		});
	});

	describe('getReviewsByReviewer', () => {
		it('returns { reviews, cursor } shape instead of plain array', async () => {
			const hexPubkey = 'f'.repeat(64);
			const result = await getReviewsByReviewer(hexPubkey, 10);

			expect(result).toHaveProperty('reviews');
			expect(result).toHaveProperty('cursor');
			expect(Array.isArray(result.reviews)).toBe(true);
		});

		it('sets until filter when before parameter is provided', async () => {
			const hexPubkey = 'f'.repeat(64);
			const beforeTs = 1700000000;
			await getReviewsByReviewer(hexPubkey, 10, beforeTs);

			const calledFilter = subscribeMock.mock.calls[0][0];
			expect(calledFilter.until).toBe(beforeTs);
		});

		it('returns empty reviews and null cursor for invalid pubkey', async () => {
			const result = await getReviewsByReviewer('invalid', 10);

			expect(result.reviews).toEqual([]);
			expect(result.cursor).toBeNull();
		});
	});
});
