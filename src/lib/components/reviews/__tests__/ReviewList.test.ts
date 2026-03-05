/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import ReviewList from '../ReviewList.svelte';
import { getReviewsForUser } from '$lib/utils/review-source';
import type { NostrVerifiedReview } from '$lib/types/review';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/utils/review-source', () => ({
	getReviewsForUser: vi.fn()
}));

vi.mock('$lib/stores/translation.store', () => ({
	TranslationStore: {
		getDisplayText: vi.fn((_id: string, text: string) => text)
	}
}));

describe('ReviewList', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows loading state initially', () => {
		vi.mocked(getReviewsForUser).mockImplementation(() => new Promise(() => {}));
		const { container } = render(ReviewList, { props: { revieweePubkey: 'npub1test' } });
		expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
	});

	it('shows empty state when no reviews', async () => {
		vi.mocked(getReviewsForUser).mockResolvedValue([]);
		render(ReviewList, { props: { revieweePubkey: 'npub1test' } });
		await waitFor(() => {
			expect(screen.getByText('reviews.list.no_reviews')).toBeInTheDocument();
		});
	});

	it('shows review cards when reviews are returned', async () => {
		const mockReviews: NostrVerifiedReview[] = [
			{
				reviewerPubkey: 'hex1',
				revieweePubkey: 'npub1reviewee',
				content: {
					overallRating: 5,
					categoryRatings: { workQuality: 5, experience: 4, deliverySpeed: 5 },
					comment: 'Excellent work'
				},
				createdAt: Date.now(),
				nostrEventId: 'ev1'
			}
		];
		vi.mocked(getReviewsForUser).mockResolvedValue(mockReviews);
		render(ReviewList, { props: { revieweePubkey: 'npub1test' } });
		await waitFor(() => {
			expect(screen.getByText('Excellent work')).toBeInTheDocument();
		});
	});

	it('calls getReviewsForUser with revieweePubkey and limit', async () => {
		vi.mocked(getReviewsForUser).mockResolvedValue([]);
		render(ReviewList, { props: { revieweePubkey: 'npub1user', limit: 30 } });
		await waitFor(() => {
			expect(vi.mocked(getReviewsForUser)).toHaveBeenCalledWith('npub1user', 30);
		});
	});
});
