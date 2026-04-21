import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ReviewList from '$lib/components/reviews/ReviewList.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

describe('ReviewList', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	const reviews = [
		{
			id: 'r-1',
			reviewDraftHash: 'hash-1',
			reviewerPubkey: 'a',
			revieweePubkey: 'b',
			subjectType: 'task',
			settlementType: 'escrow',
			contractOutcome: 'completed',
			createdAt: 10,
			overallRating: 3,
			content: { en: 'first', es: 'primero' }
		},
		{
			id: 'r-2',
			reviewDraftHash: 'hash-2',
			reviewerPubkey: 'a',
			revieweePubkey: 'b',
			subjectType: 'task',
			settlementType: 'escrow',
			contractOutcome: 'completed',
			createdAt: 20,
			overallRating: 5,
			content: { en: 'second', es: 'segundo' },
			reply: {
				id: 'reply-2',
				parentReviewEventId: 'r-2',
				revieweePubkey: 'b',
				content: { en: 'follow-up', es: 'seguimiento' },
				createdAt: 25,
				attachments: []
			}
		}
	] as const;

	it('sorts reviews newest first by default', () => {
		render(ReviewList, { reviews: reviews as unknown as never[] });
		expect(screen.getAllByText(/second|first/).map((node) => node.textContent)).toEqual([
			'second',
			'first'
		]);
	});

	it('shows an empty state when there are no reviews', () => {
		render(ReviewList, { reviews: [], emptyTitle: 'No reviews yet' });
		expect(screen.getByText('No reviews yet')).toBeTruthy();
	});

	it('marks the highlighted review card when a deep link resolves to a review id', () => {
		render(ReviewList, {
			reviews: reviews as unknown as never[],
			highlightedReviewId: 'r-2'
		});

		expect(screen.getByText('second').closest('[data-highlighted="true"]')).toBeTruthy();
	});

	it('highlights only the reply thread when a reply deep link is active', () => {
		const { container } = render(ReviewList, {
			reviews: reviews as unknown as never[],
			highlightedReplyReviewId: 'r-2'
		});

		expect(container.querySelector('[data-highlighted-reply="true"]')).toBeTruthy();
	});

	it('renders an explicit open-review action instead of a full-card click target', () => {
		const onReviewClick = vi.fn();

		render(ReviewList, {
			reviews: reviews as unknown as never[],
			onReviewClick
		});

		expect(screen.getAllByRole('button', { name: 'reviews.actions.open_review' })).toHaveLength(2);
	});
});
