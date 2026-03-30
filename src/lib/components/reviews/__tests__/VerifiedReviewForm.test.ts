import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import VerifiedReviewForm from '../VerifiedReviewForm.svelte';
import { publishVerifiedReview, hasUserReviewedEscrow } from '$lib/utils/nostr-review';
import { getNpub } from '$lib/utils/nostrKeys';
import { appStore } from '$lib/stores/app.store';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'reviews.form.title': 'Write a Review',
		'reviews.form.subtitle': 'Share your experience and help build trust in the community',
		'reviews.form.category_ratings': 'Category Ratings',
		'reviews.form.overall_rating': 'Overall Rating',
		'reviews.form.work_quality': 'Work Quality',
		'reviews.form.experience': 'Experience',
		'reviews.form.delivery_speed': 'Delivery Speed',
		'reviews.form.communication': 'Communication',
		'reviews.form.clarity': 'Clarity',
		'reviews.form.payment_timeliness': 'Payment Timeliness',
		'reviews.form.comment': 'Comment (Optional)',
		'reviews.form.comment_placeholder': 'Share your experience...',
		'reviews.form.submit': 'Submit Review',
		'reviews.form.rate_overall_aria': 'Rate {rating} out of 5',
		'reviews.form.rate_work_quality_aria': 'Rate work quality {rating} out of 5',
		'reviews.form.rate_experience_aria': 'Rate experience {rating} out of 5',
		'reviews.form.rate_delivery_speed_aria': 'Rate delivery speed {rating} out of 5',
		'reviews.form.already_reviewed':
			'You have already reviewed this escrow. Reviews are immutable once submitted.',
		'reviews.form.role_unknown':
			'Unable to determine role. Please ensure contract information is available.',
		'reviews.form.errors.overall_rating_required': 'Please provide an overall rating',
		'reviews.form.errors.work_quality_required': 'Please rate the work quality',
		'reviews.form.errors.experience_required': 'Please rate the experience',
		'reviews.form.errors.delivery_speed_required': 'Please rate the delivery speed',
		'reviews.form.errors.communication_required': 'Please rate the communication',
		'reviews.form.errors.clarity_required': 'Please rate the clarity',
		'reviews.form.errors.payment_timeliness_required': 'Please rate the payment timeliness',
		'common.cancel': 'Cancel'
	};
	const translate = (key: string, options?: { values?: Record<string, string | number> }) => {
		let value = translations[key] ?? key;
		for (const [placeholder, replacement] of Object.entries(options?.values ?? {})) {
			value = value.replace(`{${placeholder}}`, String(replacement));
		}
		return value;
	};

	return {
		t: readable(translate),
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

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

	async function waitForSubmitEnabled() {
		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Submit Review' })).not.toBeDisabled();
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getNpub).mockResolvedValue('npub1reviewer');
		vi.mocked(hasUserReviewedEscrow).mockResolvedValue(false);
		vi.mocked(publishVerifiedReview).mockResolvedValue('event-id-123');
	});

	it('renders taskee-specific categories and the comment counter', () => {
		render(VerifiedReviewForm, { props: mockProps });

		expect(screen.getByText('Write a Review')).toBeInTheDocument();
		expect(
			screen.getByText('Share your experience and help build trust in the community')
		).toBeInTheDocument();
		expect(screen.getByText('Overall Rating')).toBeInTheDocument();
		expect(screen.getByText('Category Ratings')).toBeInTheDocument();
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
			expect(
				screen.getByText(
					'You have already reviewed this escrow. Reviews are immutable once submitted.'
				)
			).toBeInTheDocument();
		});

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Submit Review' })).toBeDisabled();
		});
	});

	it('keeps submission disabled until the existing review lookup resolves', async () => {
		let resolveReviewed: ((value: boolean) => void) | undefined;
		vi.mocked(hasUserReviewedEscrow).mockImplementation(
			() =>
				new Promise<boolean>((resolve) => {
					resolveReviewed = resolve;
				})
		);

		render(VerifiedReviewForm, { props: mockProps });

		const submitButton = screen.getByRole('button', { name: 'Submit Review' });
		expect(submitButton).toBeDisabled();
		await waitFor(() => {
			expect(hasUserReviewedEscrow).toHaveBeenCalledWith('123', 'npub1reviewer');
		});

		resolveReviewed?.(false);

		await waitForSubmitEnabled();
	});

	it('shows validation errors and does not submit without ratings', async () => {
		render(VerifiedReviewForm, { props: mockProps });
		await waitForSubmitEnabled();

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
		await waitForSubmitEnabled();

		const buttons = screen.getAllByRole('button', { name: /Rate \d out of 5/ });
		await fireEvent.click(buttons[4]);
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

	it('submits a tasker review with tasker-specific category ratings', async () => {
		render(VerifiedReviewForm, {
			props: {
				...mockProps,
				revieweeRole: 'tasker'
			}
		});
		await waitForSubmitEnabled();

		await fireEvent.click(screen.getAllByRole('button', { name: /Rate \d out of 5/ })[4]);
		await fireEvent.click(screen.getByRole('button', { name: 'Rate communication 4 out of 5' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Rate clarity 5 out of 5' }));
		await fireEvent.click(
			screen.getByRole('button', { name: 'Rate payment timeliness 3 out of 5' })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Submit Review' }));

		await waitFor(() => {
			expect(publishVerifiedReview).toHaveBeenCalledWith(
				'123',
				'npub1test',
				{
					overallRating: 5,
					categoryRatings: {
						communication: 4,
						clarity: 5,
						paymentTimeliness: 3
					},
					revieweeRole: 'tasker',
					comment: undefined,
					photos: undefined
				},
				'0xabc123'
			);
		});
	});

	it('surfaces publish failures via the error toast', async () => {
		vi.mocked(publishVerifiedReview).mockRejectedValue(new Error('Relay failed'));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		render(VerifiedReviewForm, { props: mockProps });
		await waitForSubmitEnabled();

		try {
			await fireEvent.click(screen.getAllByRole('button', { name: /Rate \d out of 5/ })[4]);
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
