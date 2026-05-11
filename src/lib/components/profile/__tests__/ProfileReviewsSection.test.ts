import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import ProfileReviewsSection from '../ProfileReviewsSection.svelte';

const mocks = vi.hoisted(() => ({
	getNpub: vi.fn(),
	getReviewsForUser: vi.fn(),
	getReviewsByReviewer: vi.fn(),
	calculateReviewStats: vi.fn(),
	findPendingReviews: vi.fn(),
	ReviewList: vi.fn(() => ({ $$: { ctx: [] } })),
	verifyNostrReview: vi.fn(),
	getDisplayText: vi.fn()
}));

vi.mock('svelte-i18n', async () => ({
	t: readable((key: string) => key),
	locale: readable('en'),
	locales: readable(['en']),
	isLoading: readable(false)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: mocks.getNpub
}));

vi.mock('$lib/utils/nostr-review', () => ({
	getReviewsForUser: mocks.getReviewsForUser,
	getReviewsByReviewer: mocks.getReviewsByReviewer,
	verifyNostrReview: mocks.verifyNostrReview
}));

vi.mock('$lib/utils/review-aggregation', () => ({
	calculateReviewStats: mocks.calculateReviewStats
}));

vi.mock('$lib/utils/helpers/review', () => ({
	findPendingReviews: mocks.findPendingReviews
}));

vi.mock('../ReviewSummaryCard.svelte', async () => {
	const module = await import('../../../tests/mocks/ReviewSummaryCardMock.svelte');
	return { default: module.default };
});

vi.mock('../../reviews/ReviewManagementTabs.svelte', async () => {
	const module = await import('../../../tests/mocks/ReviewManagementTabsMock.svelte');
	return { default: module.default };
});

vi.mock('../../reviews/ReviewList.svelte', () => ({
	default: mocks.ReviewList
}));

vi.mock('$lib/stores/translation.store', () => ({
	TranslationStore: {
		getDisplayText: mocks.getDisplayText
	}
}));

vi.mock('../../reviews/PendingReviewsList.svelte', async () => {
	const module = await import('../../../tests/mocks/PendingReviewsListMock.svelte');
	return { default: module.default };
});

describe('ProfileReviewsSection', () => {
	const receivedReview = (id: string) => ({
		nostrEventId: id,
		revieweePubkey: 'npub-reviewee',
		content: {
			revieweeRole: 'tasker'
		}
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getNpub.mockResolvedValue('npub-current');
		mocks.getReviewsForUser.mockResolvedValue([receivedReview('received-1')]);
		mocks.getReviewsByReviewer.mockResolvedValue([
			{
				nostrEventId: 'given-1',
				revieweePubkey: 'npub-target-user',
				commitment: 'g'.repeat(64),
				merkleProof: {
					root: '0x' + 'f'.repeat(64),
					leaf: 'g'.repeat(64),
					proof: [],
					proofFlags: []
				},
				reviewerPubkey: 'npub-current',
				content: {
					overallRating: 4.2,
					categoryRatings: {
						communication: 4,
						clarity: 4,
						paymentTimeliness: 5
					},
					revieweeRole: 'tasker',
					comment: 'Strong collaborator'
				},
				createdAt: Date.now()
			}
		]);
		mocks.calculateReviewStats.mockReturnValue({
			totalReviews: 1,
			recentReviewsCount: 1,
			averageRating: 5,
			averageQuality: 5,
			averageProfessionalism: 5,
			averageTimeliness: 5,
			ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 }
		});
		mocks.findPendingReviews.mockResolvedValue([{ escrowId: 'escrow-1' }]);
		mocks.verifyNostrReview.mockResolvedValue(true);
		mocks.getDisplayText.mockImplementation(
			async (_eventId: string, sourceText: string) => sourceText
		);
	});

	it('loads current-user review data without UI-owned caps and avoids mounting inactive panels', async () => {
		render(ProfileReviewsSection, {
			props: {
				isCurrentUser: true
			}
		});

		await waitFor(() => {
			expect(mocks.getReviewsForUser).toHaveBeenCalledWith('npub-current', Number.MAX_SAFE_INTEGER);
			expect(mocks.getReviewsByReviewer).toHaveBeenCalledWith(
				'npub-current',
				Number.MAX_SAFE_INTEGER
			);
		});

		expect(mocks.ReviewList).not.toHaveBeenCalled();
		expect(screen.queryByText('npub-target-reviewee')).not.toBeInTheDocument();
	});

	it('renders only received reviews for another user and skips current-user metadata calls', async () => {
		render(ProfileReviewsSection, {
			props: {
				userPubkey: 'npub-target',
				isCurrentUser: false
			}
		});

		await waitFor(() => {
			expect(mocks.getReviewsForUser).toHaveBeenCalledWith('npub-target', Number.MAX_SAFE_INTEGER);
		});

		expect(mocks.getNpub).not.toHaveBeenCalled();
		expect(mocks.getReviewsByReviewer).not.toHaveBeenCalled();
		expect(mocks.findPendingReviews).not.toHaveBeenCalled();
		expect(screen.getByTestId('review-tabs')).toHaveTextContent(
			'active:received received:1 given:0 pending:0'
		);
		expect(mocks.ReviewList).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				revieweePubkey: 'npub-target'
			})
		);
	});

	it('renders authored-review context through the live given-review card after switching tabs', async () => {
		render(ProfileReviewsSection, {
			props: {
				isCurrentUser: true
			}
		});

		await waitFor(() => {
			expect(mocks.getReviewsByReviewer).toHaveBeenCalled();
		});

		expect(screen.getByTestId('review-tabs')).toHaveTextContent(
			'active:pending received:1 given:1 pending:1'
		);

		await fireEvent.click(screen.getByRole('button', { name: 'open given' }));

		await waitFor(() => {
			expect(screen.getByText('reviews.pending.review_for')).toBeInTheDocument();
		});
		expect(screen.getByText('npub-target-user')).toBeInTheDocument();
		expect(screen.queryByText('reviews.pending.contract')).not.toBeInTheDocument();
	});
});
