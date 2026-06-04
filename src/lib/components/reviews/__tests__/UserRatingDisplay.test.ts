import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import { nip19 } from 'nostr-tools';
import UserRatingDisplay from '../UserRatingDisplay.svelte';

const mocks = vi.hoisted(() => ({
	getReviewsForUser: vi.fn(),
	calculateReviewStats: vi.fn()
}));

vi.mock('svelte-i18n', async () => ({
	t: readable((key: string) => key),
	locale: readable('en'),
	locales: readable(['en']),
	isLoading: readable(false)
}));

vi.mock('$lib/utils/reviews/queries', () => ({
	getReviewsForUser: mocks.getReviewsForUser
}));

vi.mock('$lib/utils/reviews/aggregation', () => ({
	calculateReviewStats: mocks.calculateReviewStats
}));

describe('UserRatingDisplay', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getReviewsForUser.mockReset();
		mocks.calculateReviewStats.mockReset();
	});

	it('refreshes when the target user changes', async () => {
		mocks.getReviewsForUser
			.mockResolvedValueOnce([{ id: 'first-review' }])
			.mockResolvedValueOnce([{ id: 'second-review' }]);
		mocks.calculateReviewStats
			.mockReturnValueOnce({
				averageRating: 4.8,
				totalReviews: 2
			})
			.mockReturnValueOnce({
				averageRating: 3.2,
				totalReviews: 1
			});

		const rendered = render(UserRatingDisplay, {
			props: {
				userPubkey: 'npub-first'
			}
		});

		await waitFor(() => {
			expect(mocks.getReviewsForUser).toHaveBeenCalledWith('npub-first', Number.MAX_SAFE_INTEGER);
			expect(rendered.container).toHaveTextContent('4.8');
			expect(rendered.container).toHaveTextContent('(2)');
		});

		await rendered.rerender({
			userPubkey: 'npub-second'
		});

		await waitFor(() => {
			expect(mocks.getReviewsForUser).toHaveBeenCalledWith('npub-second', Number.MAX_SAFE_INTEGER);
			expect(rendered.container).toHaveTextContent('3.2');
			expect(rendered.container).toHaveTextContent('(1)');
		});
	});

	it('reuses a cached rating lookup when the same user remounts', async () => {
		mocks.getReviewsForUser.mockResolvedValueOnce([{ id: 'cached-review' }]);
		mocks.calculateReviewStats.mockReturnValueOnce({
			averageRating: 4.4,
			totalReviews: 3
		});

		const firstRender = render(UserRatingDisplay, {
			props: {
				userPubkey: 'npub-cached'
			}
		});

		await waitFor(() => {
			expect(mocks.getReviewsForUser).toHaveBeenCalledWith('npub-cached', Number.MAX_SAFE_INTEGER);
			expect(firstRender.container).toHaveTextContent('4.4');
			expect(firstRender.container).toHaveTextContent('(3)');
		});

		firstRender.unmount();

		const secondRender = render(UserRatingDisplay, {
			props: {
				userPubkey: 'npub-cached'
			}
		});

		await waitFor(() => {
			expect(secondRender.container).toHaveTextContent('4.4');
			expect(secondRender.container).toHaveTextContent('(3)');
		});

		expect(mocks.getReviewsForUser).toHaveBeenCalledTimes(1);
		expect(mocks.calculateReviewStats).toHaveBeenCalledTimes(1);
	});

	it('shares the same cached rating entry for equivalent hex and npub identities', async () => {
		const hexPubkey = 'a'.repeat(64);
		const npubPubkey = nip19.npubEncode(hexPubkey);

		mocks.getReviewsForUser.mockResolvedValueOnce([{ id: 'normalized-review' }]);
		mocks.calculateReviewStats.mockReturnValueOnce({
			averageRating: 4.1,
			totalReviews: 5
		});

		const firstRender = render(UserRatingDisplay, {
			props: {
				userPubkey: hexPubkey
			}
		});

		await waitFor(() => {
			expect(mocks.getReviewsForUser).toHaveBeenCalledWith(hexPubkey, Number.MAX_SAFE_INTEGER);
			expect(firstRender.container).toHaveTextContent('4.1');
		});

		firstRender.unmount();

		const secondRender = render(UserRatingDisplay, {
			props: {
				userPubkey: npubPubkey
			}
		});

		await waitFor(() => {
			expect(secondRender.container).toHaveTextContent('4.1');
			expect(secondRender.container).toHaveTextContent('(5)');
		});

		expect(mocks.getReviewsForUser).toHaveBeenCalledTimes(1);
		expect(mocks.calculateReviewStats).toHaveBeenCalledTimes(1);
	});

	it('falls back to zero when rating lookup fails', async () => {
		mocks.getReviewsForUser.mockRejectedValueOnce(new Error('relay unavailable'));

		const rendered = render(UserRatingDisplay, {
			props: {
				userPubkey: 'npub-error'
			}
		});

		await waitFor(() => {
			expect(rendered.container).toHaveTextContent('0');
		});
	});
});
