import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import VerifiedReviewForm from '../VerifiedReviewForm.svelte';
import { publishVerifiedReview, hasUserReviewedEscrow } from '$lib/utils/nostr-review';
import { getNpub } from '$lib/utils/nostrKeys';
import { appStore } from '$lib/stores/app.store';

vi.mock('$lib/utils/nostr-review', () => ({
	publishVerifiedReview: vi.fn(),
	hasUserReviewedEscrow: vi.fn()
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn()
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	}
}));

describe('VerifiedReviewForm', () => {
	const onSubmit = vi.fn();
	const onCancel = vi.fn();
	const mockProps = {
		escrowId: '123',
		revieweePubkey: 'npub1test',
		escrowTxHash: '0xabc123',
		revieweeRole: 'taskee' as const,
		onSubmit,
		onCancel
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getNpub).mockResolvedValue('npub1reviewer');
		vi.mocked(hasUserReviewedEscrow).mockResolvedValue(false);
		vi.mocked(publishVerifiedReview).mockResolvedValue('event-id-123');
	});

	it('renders taskee-specific categories and the comment counter', () => {
		render(VerifiedReviewForm, { props: mockProps });

		expect(screen.getByText('Write a Review')).toBeInTheDocument();
		expect(screen.getByText('Overall Rating')).toBeInTheDocument();
		expect(screen.getByText('Work Quality')).toBeInTheDocument();
		expect(screen.getByText('Experience')).toBeInTheDocument();
		expect(screen.getByText('Delivery Speed')).toBeInTheDocument();
		expect(screen.getByText('0/1000')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('disables submission when the escrow was already reviewed', async () => {
		vi.mocked(hasUserReviewedEscrow).mockResolvedValue(true);

		render(VerifiedReviewForm, { props: mockProps });

		await waitFor(() => {
			expect(screen.getByText(/already reviewed this escrow/i)).toBeInTheDocument();
		});

		expect(screen.getByRole('button', { name: 'Submit Review' })).toBeDisabled();
	});

	it('shows validation errors and does not submit without ratings', async () => {
		render(VerifiedReviewForm, { props: mockProps });

		await fireEvent.click(screen.getByRole('button', { name: 'Submit Review' }));

		await waitFor(() => {
			expect(screen.getByText('Please provide an overall rating')).toBeInTheDocument();
			expect(screen.getByText('Please rate the work quality')).toBeInTheDocument();
			expect(screen.getByText('Please rate the experience')).toBeInTheDocument();
			expect(screen.getByText('Please rate the delivery speed')).toBeInTheDocument();
		});

		expect(publishVerifiedReview).not.toHaveBeenCalled();
	});

	it('fails closed when the reviewee role is unknown', () => {
		render(VerifiedReviewForm, {
			props: {
				...mockProps,
				revieweeRole: null
			}
		});

		expect(
			screen.getByText(
				/unable to determine role\. please ensure contract information is available\./i
			)
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Submit Review' })).toBeDisabled();
		expect(publishVerifiedReview).not.toHaveBeenCalled();
	});

	it('submits a taskee review with the selected ratings and comment', async () => {
		render(VerifiedReviewForm, { props: mockProps });

		await fireEvent.click(screen.getByRole('button', { name: 'Rate 5 out of 5' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Rate work quality 4 out of 5' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Rate experience 3 out of 5' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Rate delivery speed 5 out of 5' }));
		await fireEvent.input(screen.getByPlaceholderText('Share your experience...'), {
			target: { value: 'Solid delivery and communication.' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Submit Review' }));

		await waitFor(() => {
			expect(publishVerifiedReview).toHaveBeenCalledWith(
				'123',
				'npub1test',
				{
					overallRating: 5,
					categoryRatings: {
						workQuality: 4,
						experience: 3,
						deliverySpeed: 5
					},
					revieweeRole: 'taskee',
					comment: 'Solid delivery and communication.',
					photos: undefined
				},
				'0xabc123'
			);
		});

		expect(appStore.showSuccessToast).toHaveBeenCalledWith('Review submitted successfully!');
		expect(onSubmit).toHaveBeenCalledWith('event-id-123');
	});

	it('surfaces publish failures via the error toast', async () => {
		vi.mocked(publishVerifiedReview).mockRejectedValue(new Error('Relay failed'));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		render(VerifiedReviewForm, { props: mockProps });

		try {
			await fireEvent.click(screen.getByRole('button', { name: 'Rate 5 out of 5' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Rate work quality 5 out of 5' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Rate experience 5 out of 5' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Rate delivery speed 5 out of 5' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Submit Review' }));

			await waitFor(() => {
				expect(appStore.showErrorToast).toHaveBeenCalledWith('Relay failed');
			});

			expect(consoleError).toHaveBeenCalled();
		} finally {
			consoleError.mockRestore();
		}
	});
});
