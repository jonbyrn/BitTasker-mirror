import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import ProfileReviewsSection from '../ProfileReviewsSection.svelte';

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

describe('ProfileReviewsSection', () => {
	const mockReview = (id: string) => ({
		nostrEventId: id,
		attestationEventId: `attestation-${id}`,
		revieweePubkey: 'npub-test',
		reviewerPubkey: 'npub-reviewer',
		content: {
			overallRating: 4.5,
			categoryRatings: {
				communication: 4,
				clarity: 5,
				paymentTimeliness: 4
			},
			revieweeRole: 'tasker',
			comment: 'Great work'
		},
		createdAt: Date.now()
	});

	const PAGE_SIZE = 6;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getReviewsForUser.mockResolvedValue({
			reviews: [mockReview('review-1'), mockReview('review-2')],
			cursor: null
		});
		mocks.calculateReviewStats.mockReturnValue({
			totalReviews: 2,
			recentReviewsCount: 2,
			averageRating: 4.5,
			averageQuality: 4.5,
			averageProfessionalism: 4.5,
			averageTimeliness: 4.5,
			ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 }
		});
	});

	it('fetches reviews for the given pubkey when active', async () => {
		render(ProfileReviewsSection, {
			props: {
				pubkey: 'npub-test',
				isActive: true
			}
		});

		await waitFor(() => {
			expect(mocks.getReviewsForUser).toHaveBeenCalledWith('npub-test', PAGE_SIZE, undefined);
		});
	});

	it('does not fetch reviews when inactive', async () => {
		render(ProfileReviewsSection, {
			props: {
				pubkey: 'npub-test',
				isActive: false
			}
		});

		await new Promise((r) => setTimeout(r, 100));
		expect(mocks.getReviewsForUser).not.toHaveBeenCalled();
	});

	it('renders review stats when data is loaded', async () => {
		render(ProfileReviewsSection, {
			props: {
				pubkey: 'npub-test',
				isActive: true
			}
		});

		await waitFor(() => {
			expect(mocks.calculateReviewStats).toHaveBeenCalled();
		});
	});

	it('handles empty reviews gracefully', async () => {
		mocks.getReviewsForUser.mockResolvedValue({ reviews: [], cursor: null });
		mocks.calculateReviewStats.mockReturnValue(null);

		render(ProfileReviewsSection, {
			props: {
				pubkey: 'npub-test',
				isActive: true
			}
		});

		await waitFor(() => {
			expect(mocks.getReviewsForUser).toHaveBeenCalledWith('npub-test', PAGE_SIZE, undefined);
		});
	});

	it('handles fetch errors gracefully', async () => {
		mocks.getReviewsForUser.mockRejectedValue(new Error('Network error'));

		render(ProfileReviewsSection, {
			props: {
				pubkey: 'npub-test',
				isActive: true
			}
		});

		await waitFor(() => {
			expect(mocks.getReviewsForUser).toHaveBeenCalled();
		});
	});
});
