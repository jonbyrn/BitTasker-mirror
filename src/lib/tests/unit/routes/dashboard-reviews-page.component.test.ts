import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import DashboardReviewsPage from '../../../../routes/(protected)/dashboard/reviews/+page.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const tStore = readable((key: string) => key);
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

const mocks = vi.hoisted(() => ({
	getNpub: vi.fn(),
	getReviewsForUser: vi.fn(),
	getReviewsByReviewer: vi.fn(),
	verifyNostrReview: vi.fn(),
	getDisplayText: vi.fn(),
	calculateReviewStats: vi.fn(),
	findPendingReviews: vi.fn(),
	ReviewList: vi.fn(() => ({ $$: { ctx: [] } }))
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

vi.mock('$lib/utils/review-helpers', () => ({
	findPendingReviews: mocks.findPendingReviews
}));

vi.mock('$lib/stores/translation.store', () => ({
	TranslationStore: {
		getDisplayText: mocks.getDisplayText
	}
}));

vi.mock('$lib/components/profile/ReviewSummaryCard.svelte', async () => {
	const module = await import('../../mocks/ReviewSummaryCardMock.svelte');
	return { default: module.default };
});

vi.mock('$lib/components/reviews/ReviewManagementTabs.svelte', async () => {
	const module = await import('../../mocks/ReviewManagementTabsMock.svelte');
	return { default: module.default };
});

vi.mock('$lib/components/reviews/PendingReviewsList.svelte', async () => {
	const module = await import('../../mocks/PendingReviewsListMock.svelte');
	return { default: module.default };
});

vi.mock('$lib/components/reviews/ReviewList.svelte', () => ({ default: mocks.ReviewList }));

describe('dashboard reviews page', () => {
	const receivedReview = (id: string) => ({
		nostrEventId: id,
		revieweePubkey: 'npub-reviewee',
		content: {
			revieweeRole: 'tasker'
		}
	});

	beforeEach(() => {
		vi.clearAllMocks();

		mocks.getNpub.mockReset();
		mocks.getReviewsForUser.mockReset();
		mocks.getReviewsByReviewer.mockReset();
		mocks.calculateReviewStats.mockReset();
		mocks.findPendingReviews.mockReset();
		mocks.ReviewList.mockClear();
		mocks.getNpub.mockResolvedValue('npub-current');
		mocks.getReviewsForUser.mockResolvedValue([receivedReview('received-1')]);
		mocks.getReviewsByReviewer.mockResolvedValue([]);
		mocks.calculateReviewStats.mockImplementation((reviews: Array<unknown>) => ({
			totalReviews: reviews.length,
			recentReviewsCount: reviews.length,
			averageRating: 5,
			averageQuality: 5,
			averageProfessionalism: 5,
			averageTimeliness: 5,
			ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: reviews.length }
		}));
		mocks.findPendingReviews.mockResolvedValue([{ escrowId: 'escrow-1' }]);
		mocks.verifyNostrReview.mockResolvedValue(true);
		mocks.getDisplayText.mockImplementation(
			async (_eventId: string, sourceText: string) => sourceText
		);
	});

	it('refreshes page-level counts and preserves summary role context after a pending review is submitted', async () => {
		mocks.getReviewsByReviewer
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ nostrEventId: 'given-1' }]);

		render(DashboardReviewsPage);

		await waitFor(() => {
			expect(screen.getByTestId('review-tabs')).toHaveTextContent(
				'active:pending received:1 given:0 pending:1'
			);
		});
		expect(screen.getByTestId('review-summary')).toHaveTextContent('summary:1 role:tasker');
		expect(screen.getByTestId('mock-pending-list-count')).toHaveTextContent('1');

		await fireEvent.click(screen.getByRole('button', { name: 'open pending' }));
		await waitFor(() => {
			expect(screen.getByTestId('review-tabs')).toHaveTextContent(
				'active:pending received:1 given:0 pending:1'
			);
		});
		expect(screen.getByTestId('mock-pending-list-count')).toHaveTextContent('1');

		await fireEvent.click(screen.getByRole('button', { name: 'trigger review submit' }));

		await waitFor(() => {
			expect(screen.getByTestId('review-tabs')).toHaveTextContent(
				'active:pending received:1 given:1 pending:0'
			);
		});
		expect(screen.getByTestId('mock-pending-list-count')).toHaveTextContent('0');
		expect(screen.getByTestId('review-summary')).toHaveTextContent('summary:1 role:tasker');
		expect(mocks.getReviewsByReviewer).toHaveBeenCalledTimes(2);
		expect(mocks.getReviewsByReviewer).toHaveBeenCalledWith(
			'npub-current',
			Number.MAX_SAFE_INTEGER
		);
		expect(mocks.findPendingReviews).toHaveBeenCalledTimes(1);
		expect(mocks.getReviewsForUser).toHaveBeenCalledTimes(1);
		expect(mocks.getReviewsForUser).toHaveBeenCalledWith('npub-current', Number.MAX_SAFE_INTEGER);
	});

	it('keeps received reviews visible when management metadata fails to load', async () => {
		mocks.findPendingReviews.mockRejectedValueOnce(new Error('metadata unavailable'));

		render(DashboardReviewsPage);

		await waitFor(() => {
			expect(screen.getByText('metadata unavailable')).toBeInTheDocument();
		});

		expect(screen.getByTestId('review-tabs')).toHaveTextContent(
			'active:received received:1 given:0 pending:0'
		);
		expect(mocks.ReviewList.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				reviews: [receivedReview('received-1')],
				revieweePubkey: 'npub-current'
			})
		);
	});

	it('keeps partial pending-review data and shows a warning when metadata refresh partially fails', async () => {
		const partialError = Object.assign(new Error('partial metadata unavailable'), {
			pendingReviews: [{ escrowId: 'escrow-partial' }]
		});
		mocks.findPendingReviews.mockRejectedValueOnce(partialError);
		mocks.getReviewsByReviewer.mockResolvedValueOnce([
			{ nostrEventId: 'given-1', revieweePubkey: 'npub-target' }
		]);

		render(DashboardReviewsPage);

		await waitFor(() => {
			expect(screen.getByText('partial metadata unavailable')).toBeInTheDocument();
		});

		expect(screen.getByTestId('review-tabs')).toHaveTextContent(
			'active:pending received:1 given:1 pending:1'
		);
		expect(screen.getByTestId('mock-pending-list-count')).toHaveTextContent('1');
	});

	it('renders authored-review context through the live given-review card', async () => {
		mocks.getReviewsByReviewer.mockResolvedValueOnce([
			{
				nostrEventId: 'given-1',
				commitment: 'g'.repeat(64),
				merkleProof: {
					root: '0x' + 'f'.repeat(64),
					leaf: 'g'.repeat(64),
					proof: [],
					proofFlags: []
				},
				reviewerPubkey: 'npub-current',
				revieweePubkey: 'npub-target-user',
				content: {
					overallRating: 4.2,
					categoryRatings: {
						communication: 4,
						clarity: 4,
						paymentTimeliness: 5
					},
					revieweeRole: 'tasker',
					comment: 'Great client'
				},
				createdAt: Date.now()
			}
		]);
		mocks.findPendingReviews.mockResolvedValueOnce([]);

		render(DashboardReviewsPage);

		await waitFor(() => {
			expect(screen.getByTestId('review-tabs')).toHaveTextContent(
				'active:received received:1 given:1 pending:0'
			);
		});

		await fireEvent.click(screen.getByRole('button', { name: 'open given' }));

		await waitFor(() => {
			expect(screen.getByText('reviews.pending.review_for')).toBeInTheDocument();
		});
		expect(screen.getByText('npub-target-user')).toBeInTheDocument();
		expect(screen.queryByText('reviews.pending.contract')).not.toBeInTheDocument();
	});

	it('does not mount inactive received or given panels while the pending tab is active', async () => {
		mocks.getReviewsByReviewer.mockResolvedValueOnce([
			{ nostrEventId: 'given-1', revieweePubkey: 'npub-target-reviewee' }
		]);
		mocks.findPendingReviews.mockResolvedValueOnce([{ escrowId: 'escrow-1' }]);

		render(DashboardReviewsPage);

		await waitFor(() => {
			expect(screen.getByTestId('review-tabs')).toHaveTextContent(
				'active:pending received:1 given:1 pending:1'
			);
		});

		expect(mocks.ReviewList).not.toHaveBeenCalled();
		expect(screen.queryByText('npub-target-reviewee')).not.toBeInTheDocument();
	});
});
