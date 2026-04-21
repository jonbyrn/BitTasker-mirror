import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import PendingReviewsList from '$lib/components/reviews/PendingReviewsList.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'reviews.context.subject.task') return 'Task';
			if (key === 'reviews.settlement.escrow') return 'Escrow';
			if (key === 'reviews.outcome.completed') return 'Completed';
			if (key === 'reviews.pending.completed') return 'Completed';
			return key;
		}),
		locale: readable('en')
	};
});

describe('PendingReviewsList', () => {
	it('renders a pending review card and calls the click handler', async () => {
		const onReviewClick = vi.fn();

		render(PendingReviewsList, {
			pendingReviews: [
				{
					id: 'pending-1',
					revieweePubkey: 'reviewee-pubkey',
					revieweeLabel: 'Alex',
					subjectType: 'task',
					subjectLabel: 'Logo refresh',
					settlementType: 'escrow',
					contractOutcome: 'completed',
					createdAt: Date.now() - 60_000
				}
			],
			onReviewClick
		});

		expect(screen.getByText('Alex')).toBeTruthy();
		expect(
			screen.getByText(
				(_, element) =>
					element?.tagName === 'P' &&
					element.className.includes('text-xs') &&
					element.textContent?.includes('Task') &&
					element.textContent?.includes('Completed')
			)
		).toBeTruthy();
		expect(screen.getByText('Escrow')).toBeTruthy();
		expect(screen.getByText('Completed')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'reviews.pending.review_now' }));
		expect(onReviewClick).toHaveBeenCalledTimes(1);
	});
});
