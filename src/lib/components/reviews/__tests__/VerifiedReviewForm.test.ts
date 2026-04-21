import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import VerifiedReviewForm from '$lib/components/reviews/VerifiedReviewForm.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, options?: { values?: Record<string, string | number> }) => {
			const table: Record<string, string> = {
				'reviews.form.title': 'Write a review',
				'reviews.form.subtitle': 'Reviews are public and immutable once submitted.',
				'reviews.form.draft_restored': 'Draft restored from this device.',
				'reviews.form.discard_draft': 'Discard draft',
				'reviews.form.overall_rating': 'Overall rating',
				'reviews.form.context_title': 'Review context',
				'reviews.context.subject.task': 'Task',
				'reviews.context.subject.service_booking': 'Service booking',
				'reviews.settlement.escrow': 'Escrow',
				'reviews.settlement.service_quote_contract': 'Service quote',
				'reviews.settlement.instant_buy_contract': 'Instant buy',
				'reviews.outcome.completed': 'Completed',
				'reviews.outcome.disputed_resolved_payout': 'Dispute resolved, paid out',
				'reviews.outcome.disputed_resolved_refund': 'Dispute resolved, refunded',
				'reviews.outcome.refunded': 'Refunded',
				'reviews.form.english_label': 'English review',
				'reviews.form.spanish_label': 'Spanish review',
				'reviews.form.attachments_label': 'Review attachments',
				'reviews.form.upload_label': 'Add images or video',
				'reviews.form.submit': 'Submit review',
				'reviews.form.submitting': 'Submitting review...',
				'reviews.form.rate_overall_aria': 'Rate {rating} out of 5',
				'reviews.form.reviewing': 'Reviewing: {reviewee}',
				'reviews.form.reviewee_role': 'Role: {role}',
				'reviews.form.context_summary':
					'Subject: {subjectType} | Settlement: {settlementType} | Outcome: {contractOutcome}',
				'common.cancel': 'Cancel',
				'reviews.form.errors.overall_rating_required': 'Please provide an overall rating.',
				'reviews.form.errors.category_rating_required': 'Please rate all required categories.',
				'reviews.form.errors.comment_required': 'Add review text in at least one language.',
				'reviews.form.errors.submit_failed': 'Unable to submit review.'
			};
			const template = table[key] ?? key;
			return template.replace(/\{(\w+)\}/g, (_, name) => String(options?.values?.[name] ?? ''));
		}),
		locale: readable('en')
	};
});

vi.mock('$lib/components/MediaUploader.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="media-uploader">Uploader</div>'
	})
}));

describe('VerifiedReviewForm', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it('submits bilingual review content and ratings', async () => {
		const onSubmit = vi.fn();

		render(VerifiedReviewForm, {
			revieweePubkey: 'reviewee-pubkey',
			revieweeLabel: 'Alex',
			subjectLabel: 'Logo refresh',
			subjectType: 'task',
			settlementType: 'escrow',
			contractOutcome: 'completed',
			revieweeRole: 'taskee',
			categoryGroups: [
				{
					id: 'taskee',
					heading: 'As a taskee',
					categories: [{ id: 'quality', label: 'Quality', value: 5 }]
				}
			],
			initialRating: 5,
			onSubmit
		});

		await fireEvent.input(screen.getAllByRole('textbox')[0], { target: { value: 'Great work' } });
		await fireEvent.input(screen.getAllByRole('textbox')[1], { target: { value: 'Gran trabajo' } });
		await fireEvent.click(screen.getByText('Submit review'));

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0].overallRating).toBe(5);
		expect(onSubmit.mock.calls[0][0].content).toEqual({ en: 'Great work', es: 'Gran trabajo' });
		expect(onSubmit.mock.calls[0][0].categoryScores[0]).toMatchObject({ id: 'quality', value: 5 });
	});

	it('shows validation feedback when content is empty', async () => {
		const onSubmit = vi.fn();

		render(VerifiedReviewForm, {
			revieweePubkey: 'reviewee-pubkey',
			revieweeLabel: 'Alex',
			subjectLabel: 'Logo refresh',
			subjectType: 'task',
			settlementType: 'escrow',
			contractOutcome: 'completed',
			revieweeRole: 'taskee',
			categoryGroups: [],
			initialRating: 5,
			onSubmit
		});

		await fireEvent.click(screen.getByText('Submit review'));

		expect(screen.getByText('Add review text in at least one language.')).toBeTruthy();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('disables submit controls while submitting', () => {
		const onCancel = vi.fn();

		render(VerifiedReviewForm, {
			revieweePubkey: 'reviewee-pubkey',
			revieweeLabel: 'Alex',
			subjectLabel: 'Logo refresh',
			subjectType: 'task',
			settlementType: 'escrow',
			contractOutcome: 'completed',
			revieweeRole: 'taskee',
			categoryGroups: [],
			isSubmitting: true,
			onCancel
		});

		expect(screen.getByRole('button', { name: 'Submitting review...' })).toHaveAttribute(
			'disabled'
		);
		for (const button of screen.getAllByRole('button', { name: 'Cancel' })) {
			expect(button).toHaveAttribute('disabled');
		}
	});

	it('resets to the active review target when switching away and back', async () => {
		const { rerender } = render(VerifiedReviewForm, {
			revieweePubkey: 'reviewee-a',
			revieweeLabel: 'Alex',
			subjectLabel: 'Logo refresh',
			subjectType: 'task',
			settlementType: 'escrow',
			contractOutcome: 'completed',
			revieweeRole: 'taskee',
			categoryGroups: [],
			initialContent: { en: 'First draft', es: 'Primer borrador' }
		});

		expect(screen.getByDisplayValue('First draft')).toBeTruthy();
		expect(screen.getByDisplayValue('Primer borrador')).toBeTruthy();

		await fireEvent.input(screen.getAllByRole('textbox')[0], { target: { value: 'Edited draft' } });
		await rerender({
			revieweePubkey: 'reviewee-b',
			revieweeLabel: 'Taylor',
			subjectLabel: 'Landing page polish',
			subjectType: 'service_booking',
			settlementType: 'service_quote_contract',
			contractOutcome: 'completed',
			revieweeRole: 'provider',
			categoryGroups: [],
			initialContent: { en: 'Second draft', es: 'Segundo borrador' }
		});

		expect(screen.getByDisplayValue('Second draft')).toBeTruthy();
		expect(screen.getByDisplayValue('Segundo borrador')).toBeTruthy();

		await rerender({
			revieweePubkey: 'reviewee-a',
			revieweeLabel: 'Alex',
			subjectLabel: 'Logo refresh',
			subjectType: 'task',
			settlementType: 'escrow',
			contractOutcome: 'completed',
			revieweeRole: 'taskee',
			categoryGroups: [],
			initialContent: { en: 'First draft', es: 'Primer borrador' }
		});

		expect(screen.getByDisplayValue('First draft')).toBeTruthy();
		expect(screen.getByDisplayValue('Primer borrador')).toBeTruthy();
	});

	it('shows a restored draft cue and can discard it', async () => {
		const draftKey = 'reviews.form.reviewee-pubkey:task:escrow:completed:taskee';
		const storedDraft = {
			overallRating: 4,
			contentEn: 'Restored English draft',
			contentEs: 'Borrador restaurado',
			attachmentResults: [],
			categoryValues: {}
		};
		const getItemSpy = vi.spyOn(window.localStorage, 'getItem').mockImplementation((key) => {
			return key === draftKey ? JSON.stringify(storedDraft) : null;
		});
		const removeItemSpy = vi
			.spyOn(window.localStorage, 'removeItem')
			.mockImplementation(() => undefined);
		const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => undefined);

		render(VerifiedReviewForm, {
			revieweePubkey: 'reviewee-pubkey',
			revieweeLabel: 'Alex',
			subjectLabel: 'Logo refresh',
			subjectType: 'task',
			settlementType: 'escrow',
			contractOutcome: 'completed',
			revieweeRole: 'taskee',
			categoryGroups: [],
			initialRating: 0,
			initialContent: { en: '', es: '' }
		});

		await tick();
		await waitFor(() => {
			expect(screen.getByText('Draft restored from this device.')).toBeTruthy();
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
		expect(screen.queryByText('Draft restored from this device.')).toBeNull();
		expect(screen.getAllByRole('textbox')[0]).toHaveValue('');
		expect(screen.getAllByRole('textbox')[1]).toHaveValue('');
		expect(getItemSpy).toHaveBeenCalledWith(draftKey);
		expect(removeItemSpy).toHaveBeenCalledWith(draftKey);
		expect(setItemSpy).toHaveBeenCalled();
	});
});
