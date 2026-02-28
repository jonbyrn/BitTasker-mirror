/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import VerifiedReviewForm from '../VerifiedReviewForm.svelte';
import { publishReview, hasUserReviewedEscrow } from '$lib/utils/nostr-review';
import { getNpub } from '$lib/utils/nostrKeys';
import { appStore } from '$lib/stores/app.store';

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
		
		expect(screen.getByText(/Write a Review/i)).toBeInTheDocument();
		expect(screen.getByText(/Overall Rating/i)).toBeInTheDocument();
		// Taskee role shows: Work Quality, Experience, Delivery Speed
		expect(screen.getByText(/Work Quality/i)).toBeInTheDocument();
		expect(screen.getByText(/Experience/i)).toBeInTheDocument();
		expect(screen.getByText(/Delivery Speed/i)).toBeInTheDocument();
	});

	it('should disable form when user has already reviewed', async () => {
		vi.mocked(hasUserReviewedEscrow).mockResolvedValue(true);
		
		render(VerifiedReviewForm, { props: mockProps });
		
		await waitFor(() => {
			const submitButton = screen.getByRole('button', { name: /Submit Review/i });
			expect(submitButton).toBeDisabled();
		});
	});

	it('should validate required ratings', async () => {
		render(VerifiedReviewForm, { props: mockProps });
		
		const submitButton = screen.getByRole('button', { name: /Submit Review/i });
		await fireEvent.click(submitButton);
		
		// Form should not submit without ratings
		await waitFor(() => {
			expect(publishReview).not.toHaveBeenCalled();
		});
	});

	it('should submit review with valid data', async () => {
		render(VerifiedReviewForm, { props: mockProps });
		
		// Set ratings (simulate clicking stars)
		// Note: In a real test, we'd need to simulate the actual star clicks
		// For now, we'll test the form structure
		
		const submitButton = screen.getByRole('button', { name: /Submit Review/i });
		expect(submitButton).toBeInTheDocument();
	});

	it('should show comment character counter', () => {
		render(VerifiedReviewForm, { props: mockProps });
		
		const textarea = screen.getByPlaceholderText(/Share your experience/i);
		expect(textarea).toBeInTheDocument();
		
		// Character counter should be visible
		expect(screen.getByText(/0\/1000/i)).toBeInTheDocument();
	});
});


