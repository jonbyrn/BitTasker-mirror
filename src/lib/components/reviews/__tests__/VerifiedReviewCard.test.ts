import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import VerifiedReviewCard from '$lib/components/reviews/VerifiedReviewCard.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, options?: { values?: Record<string, string | number> }) => {
			if (key === 'reviews.reply') return 'Reply';
			if (key === 'reviews.reply.label') return 'Reply';
			if (key === 'reviews.verified') return 'Verified';
			if (key === 'reviews.unverified') return 'Unverified';
			if (key === 'reviews.pending_verification') return 'Verification pending';
			if (key === 'reviews.context.subject.task') return 'Task';
			if (key === 'reviews.context.service') return 'Service';
			if (key === 'reviews.settlement.escrow') return 'Escrow';
			if (key === 'reviews.outcome.completed') return 'Completed';
			if (key === 'reviews.context.reviewer') return 'Reviewer';
			if (key === 'reviews.context.reviewee') return 'Reviewee';
			if (key === 'reviews.context.subject') return 'Subject';
			if (key === 'reviews.reply.focused') return 'Reply focused';
			return options?.values ? `${key} ${JSON.stringify(options.values)}` : key;
		}),
		locale: readable('en')
	};
});

describe('VerifiedReviewCard', () => {
	const review = {
		id: 'review-1',
		reviewDraftHash: 'hash-1',
		reviewerPubkey: 'reviewer-pubkey',
		revieweePubkey: 'reviewee-pubkey',
		subjectType: 'task',
		settlementType: 'escrow',
		contractOutcome: 'completed',
		verificationState: 'verified',
		createdAt: Date.now() - 60_000,
		overallRating: 4.5,
		content: { en: 'Great work', es: 'Gran trabajo' },
		categoryScores: [{ id: 'quality', label: 'Quality', value: 4.5 }],
		attachments: [{ url: 'https://cdn.example.com/image.webp', type: 'image', alt: 'Evidence' }],
		reply: {
			id: 'reply-1',
			parentReviewEventId: 'review-1',
			revieweePubkey: 'reviewee-pubkey',
			content: { en: 'Thanks', es: 'Gracias' },
			createdAt: Date.now() - 30_000,
			attachments: []
		}
	} as const;

	it('renders the review, attachment gallery, and reply action', () => {
		const onReply = vi.fn();

		render(VerifiedReviewCard, {
			review,
			showReviewerContext: true,
			showRevieweeContext: true,
			onReply,
			replyHighlighted: true
		});

		expect(screen.getByText('Verified')).toBeTruthy();
		expect(screen.getByText('Great work')).toBeTruthy();
		expect(screen.getByText('Task')).toBeTruthy();
		expect(screen.getByText('Escrow')).toBeTruthy();
		expect(screen.getByText('Completed')).toBeTruthy();
		expect(screen.getByRole('img', { name: 'Evidence' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy();
		expect(screen.getAllByText('Reply focused')).toHaveLength(2);
		expect(screen.getByText('Thanks').parentElement?.parentElement?.className).toContain(
			'border-secondary/70'
		);

		fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
		expect(onReply).toHaveBeenCalledWith('review-1');
	});

	it('highlights the reply thread when requested', () => {
		const { container } = render(VerifiedReviewCard, {
			review,
			replyHighlighted: true
		});

		expect(container.querySelector('[data-highlighted-reply="true"]')).toBeTruthy();
	});
});
