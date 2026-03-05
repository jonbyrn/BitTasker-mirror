/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import UserRatingDisplay from '../UserRatingDisplay.svelte';
import { getReviewsForUser } from '$lib/utils/review-source';
import { calculateReviewStats } from '$lib/utils/review-aggregation';

vi.mock('$lib/utils/review-source', () => ({
	getReviewsForUser: vi.fn()
}));

vi.mock('$lib/utils/review-aggregation', () => ({
	calculateReviewStats: vi.fn()
}));

vi.mock('nostr-tools', () => ({
	nip19: {
		npubEncode: vi.fn((hex: string) => `npub${hex.slice(0, 8)}`)
	}
}));

describe('UserRatingDisplay', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getReviewsForUser).mockResolvedValue([]);
		vi.mocked(calculateReviewStats).mockReturnValue({
			totalReviews: 0,
			averageRating: 0,
			averageQuality: 0,
			averageProfessionalism: 0,
			averageTimeliness: 0,
			ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
		});
	});

	it('shows loading state initially', () => {
		vi.mocked(getReviewsForUser).mockImplementation(() => new Promise(() => {}));
		const { container } = render(UserRatingDisplay, { props: { userPubkey: 'npub1test' } });
		expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
	});

	it('shows rating and count after load', async () => {
		vi.mocked(getReviewsForUser).mockResolvedValue([
			{
				reviewerPubkey: 'r1',
				revieweePubkey: 'npub1test',
				content: { overallRating: 4, categoryRatings: {} },
				createdAt: Date.now(),
				nostrEventId: 'e1'
			}
		]);
		vi.mocked(calculateReviewStats).mockReturnValue({
			totalReviews: 1,
			averageRating: 4,
			averageQuality: 0,
			averageProfessionalism: 0,
			averageTimeliness: 0,
			ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 }
		});
		render(UserRatingDisplay, {
			props: { userPubkey: 'npub1test', showCount: true, showStars: true }
		});
		await waitFor(() => {
			expect(screen.getByText(/4\.0/)).toBeInTheDocument();
			expect(screen.getByText(/1/)).toBeInTheDocument();
		});
	});

	it('calls getReviewsForUser with userPubkey', async () => {
		render(UserRatingDisplay, { props: { userPubkey: 'npub1user' } });
		await waitFor(() => {
			expect(getReviewsForUser).toHaveBeenCalledWith('npub1user', 100);
		});
	});
});
