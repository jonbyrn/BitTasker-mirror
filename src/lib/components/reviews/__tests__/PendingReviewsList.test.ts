import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import PendingReviewsList from '../PendingReviewsList.svelte';
import { findPendingReviews } from '$lib/utils/review-helpers';

vi.mock('$lib/utils/review-helpers', () => ({
	findPendingReviews: vi.fn()
}));

vi.mock('../ReviewPromptModal.svelte', async () => {
	const modal = await import('./mocks/ReviewPromptModal.mock.svelte');
	return { default: modal.default };
});

describe('PendingReviewsList', () => {
	const pendingReview = {
		contract: {} as never,
		escrowId: 'escrow-12345678',
		escrowTxHash: '0xescrowtx',
		revieweePubkey: 'npub1reviewee',
		revieweeName: 'Alice',
		completedAt: Date.now(),
		canReview: true
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders prefetched pending reviews without reloading them on mount', () => {
		render(PendingReviewsList, {
			props: {
				initialPendingReviews: [pendingReview]
			}
		});

		expect(screen.getByText('Alice')).toBeInTheDocument();
		expect(findPendingReviews).not.toHaveBeenCalled();
	});

	it('reloads the pending reviews after a review submission', async () => {
		vi.mocked(findPendingReviews).mockResolvedValueOnce([pendingReview]).mockResolvedValueOnce([]);

		const { container } = render(PendingReviewsList);

		await waitFor(() => {
			expect(screen.getByText('Alice')).toBeInTheDocument();
		});

		const reviewButton = container.querySelector('button.btn-primary');
		expect(reviewButton).not.toBeNull();

		await fireEvent.click(reviewButton!);

		await waitFor(() => {
			expect(screen.getByTestId('mock-review-modal')).toBeInTheDocument();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Mock submit review' }));

		await waitFor(() => {
			expect(findPendingReviews).toHaveBeenCalledTimes(2);
		});
		await waitFor(() => {
			expect(screen.queryByText('Alice')).not.toBeInTheDocument();
		});
	});

	it('surfaces a load error when pending reviews cannot be fetched', async () => {
		vi.mocked(findPendingReviews).mockRejectedValue(new Error('relay unavailable'));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			render(PendingReviewsList);

			await waitFor(() => {
				expect(screen.getByText('relay unavailable')).toBeInTheDocument();
			});
		} finally {
			consoleError.mockRestore();
		}
	});

	it('notifies the parent with the refreshed pending review list after submission', async () => {
		const onReviewSubmitted = vi.fn();
		vi.mocked(findPendingReviews).mockResolvedValueOnce([pendingReview]).mockResolvedValueOnce([]);

		const { container } = render(PendingReviewsList, {
			props: {
				onReviewSubmitted
			}
		});

		await waitFor(() => {
			expect(screen.getByText('Alice')).toBeInTheDocument();
		});

		await fireEvent.click(container.querySelector('button.btn-primary')!);
		await waitFor(() => {
			expect(screen.getByTestId('mock-review-modal')).toBeInTheDocument();
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Mock submit review' }));

		await waitFor(() => {
			expect(onReviewSubmitted).toHaveBeenCalledWith([]);
		});
	});

	it('keeps the optimistic pending state when the post-submit refresh fails', async () => {
		const onReviewSubmitted = vi.fn();
		vi.mocked(findPendingReviews)
			.mockResolvedValueOnce([pendingReview])
			.mockRejectedValueOnce(new Error('refresh failed'));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			const { container } = render(PendingReviewsList, {
				props: {
					onReviewSubmitted
				}
			});

			await waitFor(() => {
				expect(screen.getByText('Alice')).toBeInTheDocument();
			});

			await fireEvent.click(container.querySelector('button.btn-primary')!);
			await waitFor(() => {
				expect(screen.getByTestId('mock-review-modal')).toBeInTheDocument();
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Mock submit review' }));

			await waitFor(() => {
				expect(onReviewSubmitted).toHaveBeenCalledWith([]);
			});
			expect(screen.queryByText('Alice')).not.toBeInTheDocument();
			expect(screen.getByText('refresh failed')).toBeInTheDocument();
		} finally {
			consoleError.mockRestore();
		}
	});

	it('shows a stable identity block with both name and shortened pubkey context', () => {
		render(PendingReviewsList, {
			props: {
				initialPendingReviews: [
					{
						...pendingReview,
						revieweePubkey: 'npub1aliceidentity1234567890abcdef'
					}
				]
			}
		});

		expect(screen.getByText('Alice')).toBeInTheDocument();
		expect(
			screen.getByText((content) => content.includes('npub1aliceid...abcdef'))
		).toBeInTheDocument();
		expect(screen.getByTitle('npub1aliceidentity1234567890abcdef')).toBeInTheDocument();
	});
});
