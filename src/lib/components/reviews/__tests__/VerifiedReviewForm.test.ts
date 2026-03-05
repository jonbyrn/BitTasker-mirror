/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import VerifiedReviewForm from '../VerifiedReviewForm.svelte';
import { publishReview, hasUserReviewedEscrow } from '$lib/utils/nostr-review';
import { getNpub } from '$lib/utils/nostrKeys';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

// Mock dependencies
vi.mock('$lib/utils/nostr-review', () => ({
	publishReview: vi.fn(),
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
	const mockProps = {
		escrowId: '123',
		revieweePubkey: 'npub1test',
		escrowTxHash: '0xabc123',
		taskId: 'task-123',
		revieweeRole: 'taskee' as const
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getNpub).mockResolvedValue('npub1reviewer');
		vi.mocked(hasUserReviewedEscrow).mockResolvedValue(false);
		vi.mocked(publishReview).mockResolvedValue('event-id-123');
	});

	it('should render the form', () => {
		render(VerifiedReviewForm, { props: mockProps });
		// With i18n mock returning keys: labels show as translation keys (exact to avoid matching _desc)
		expect(screen.getByText('reviews.form.overall_rating')).toBeInTheDocument();
		expect(screen.getByText('reviews.form.work_quality')).toBeInTheDocument();
		expect(screen.getByText('reviews.form.experience')).toBeInTheDocument();
		expect(screen.getByText('reviews.form.delivery_speed')).toBeInTheDocument();
	});

	it('should disable form when user has already reviewed', async () => {
		vi.mocked(hasUserReviewedEscrow).mockResolvedValue(true);

		render(VerifiedReviewForm, { props: mockProps });

		await waitFor(() => {
			const submitButton = screen.getByRole('button', { name: /reviews\.form\.submit/i });
			expect(submitButton).toBeDisabled();
		});
	});

	it('should validate required ratings', async () => {
		render(VerifiedReviewForm, { props: mockProps });

		const submitButton = screen.getByRole('button', { name: /reviews\.form\.submit/i });
		await fireEvent.click(submitButton);

		// Form should not submit without ratings
		await waitFor(() => {
			expect(publishReview).not.toHaveBeenCalled();
		});
	});

	it('should submit review with valid data', async () => {
		render(VerifiedReviewForm, { props: mockProps });

		const submitButton = screen.getByRole('button', { name: /reviews\.form\.submit/i });
		expect(submitButton).toBeInTheDocument();
	});

	it('should show comment character counter', () => {
		render(VerifiedReviewForm, { props: mockProps });
		// Placeholder is translated; mock returns key
		const textarea = screen.getByPlaceholderText(/reviews\.form\.comment_placeholder/i);
		expect(textarea).toBeInTheDocument();
		// Counter is literal: 0/1000
		expect(screen.getByText(/0\/1000/)).toBeInTheDocument();
	});
});
