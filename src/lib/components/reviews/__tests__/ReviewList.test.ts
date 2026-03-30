import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import ReviewList from '../ReviewList.svelte';
import { getReviewsForUser } from '$lib/utils/nostr-review';
import type { NostrVerifiedReview } from '$lib/types/review';

vi.mock('$lib/utils/nostr-review', () => ({
	getReviewsForUser: vi.fn()
}));

vi.mock('../VerifiedReviewCard.svelte', () => ({
	default: vi.fn(() => ({ $$: { ctx: [] } }))
}));

describe('ReviewList', () => {
	function createReview(id: string, rating = 5): NostrVerifiedReview {
		return {
			commitment: 'c'.repeat(64),
			merkleProof: {
				root: '0x' + 'd'.repeat(64),
				leaf: 'c'.repeat(64),
				proof: [],
				proofFlags: []
			},
			reviewerPubkey: 'npub1reviewer',
			revieweePubkey: 'npub1reviewee',
			content: {
				overallRating: rating,
				categoryRatings: {
					quality: rating,
					professionalism: rating,
					timeliness: rating
				}
			},
			createdAt: Date.now(),
			nostrEventId: id
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('reloads reviews when the reviewee changes', async () => {
		vi.mocked(getReviewsForUser)
			.mockResolvedValueOnce([createReview('review-a')])
			.mockResolvedValueOnce([createReview('review-b')]);

		const rendered = render(ReviewList, {
			props: {
				revieweePubkey: 'npub1first'
			}
		});

		await waitFor(() => {
			expect(getReviewsForUser).toHaveBeenCalledWith('npub1first', 50);
		});

		await rendered.rerender({ revieweePubkey: 'npub1second' });

		await waitFor(() => {
			expect(getReviewsForUser).toHaveBeenCalledWith('npub1second', 50);
		});
		expect(getReviewsForUser).toHaveBeenCalledTimes(2);
	});

	it('uses prefetched reviews and keeps the clickable wrapper out of nested button markup', async () => {
		const onReviewClick = vi.fn();
		const rendered = render(ReviewList, {
			props: {
				revieweePubkey: 'npub1first',
				reviews: [createReview('review-a')],
				onReviewClick
			}
		});

		expect(getReviewsForUser).not.toHaveBeenCalled();
		const clickableWrapper = rendered.container.querySelector('[role="button"]');
		expect(clickableWrapper).not.toBeNull();
		expect(rendered.container.querySelector('button.cursor-pointer')).toBeNull();
		await fireEvent.click(clickableWrapper!);
		expect(onReviewClick.mock.calls[0]?.[0]).toMatchObject({ nostrEventId: 'review-a' });

		await rendered.rerender({
			revieweePubkey: 'npub1first',
			reviews: [createReview('review-a')],
			onReviewClick: undefined
		});

		await waitFor(() => {
			expect(rendered.container.querySelector('[role="button"]')).toBeNull();
		});
	});
});
