import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReviewReplyComposer from '$lib/components/reviews/ReviewReplyComposer.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, options?: { values?: Record<string, string | number> }) => {
			const table: Record<string, string> = {
				'reviews.reply.composer_title': 'Write a reply',
				'reviews.reply.context_title': 'Replying to this review',
				'reviews.reply.context_excerpt_label': 'Original review',
				'reviews.reply.context_excerpt_empty': 'No review text was provided.',
				'reviews.reply.draft_restored': 'Draft restored from this device.',
				'reviews.reply.discard_draft': 'Discard draft',
				'reviews.reply.focused': 'Reply focused',
				'reviews.reply.english_label': 'English reply',
				'reviews.reply.spanish_label': 'Spanish reply',
				'reviews.reply.attachments_label': 'Reply attachments',
				'reviews.reply.upload_label': 'Add images or video',
				'reviews.reply.submit': 'Submit reply',
				'reviews.reply.submitting': 'Submitting reply...',
				'reviews.reply.errors.empty_reply': 'Add reply text in at least one language.',
				'reviews.reply.errors.submit_failed': 'Unable to submit reply.',
				'common.cancel': 'Cancel'
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

describe('ReviewReplyComposer', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it('submits a localized reply draft', async () => {
		const onSubmit = vi.fn();

		render(ReviewReplyComposer, {
			parentReviewId: 'review-1',
			revieweePubkey: 'reviewee-pubkey',
			revieweeLabel: 'Alex',
			parentReview: {
				id: 'review-1',
				reviewerPubkey: 'reviewer-pubkey',
				reviewerLabel: 'Jordan',
				revieweeLabel: 'Alex',
				subjectType: 'task',
				settlementType: 'escrow',
				contractOutcome: 'completed',
				overallRating: 4.5,
				createdAt: Date.now() - 60_000,
				content: { en: 'Great work', es: 'Gran trabajo' }
			},
			onSubmit
		});

		expect(screen.getByText('Replying to this review')).toBeTruthy();
		expect(screen.getByText('Great work')).toBeTruthy();
		await fireEvent.input(screen.getAllByRole('textbox')[0], { target: { value: 'Thanks' } });
		await fireEvent.input(screen.getAllByRole('textbox')[1], { target: { value: 'Gracias' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Submit reply' }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			parentReviewId: 'review-1',
			content: { en: 'Thanks', es: 'Gracias' }
		});
	});

	it('keeps the submit action disabled while submitting', async () => {
		const onSubmit = vi.fn();
		const onCancel = vi.fn();

		render(ReviewReplyComposer, {
			parentReviewId: 'review-1',
			revieweePubkey: 'reviewee-pubkey',
			revieweeLabel: 'Alex',
			onSubmit,
			onCancel,
			isSubmitting: true
		});

		expect(screen.getByRole('button', { name: 'Submitting reply...' })).toHaveAttribute('disabled');
		expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('disabled');
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('rejects an empty reply draft', async () => {
		const onSubmit = vi.fn();

		render(ReviewReplyComposer, {
			parentReviewId: 'review-1',
			revieweePubkey: 'reviewee-pubkey',
			revieweeLabel: 'Alex',
			onSubmit
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Submit reply' }));

		expect(screen.getByText('Add reply text in at least one language.')).toBeTruthy();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('resets to the active parent review draft when switching away and back', async () => {
		const { rerender } = render(ReviewReplyComposer, {
			parentReviewId: 'review-1',
			revieweePubkey: 'reviewee-a',
			revieweeLabel: 'Alex',
			initialContent: { en: 'First reply', es: 'Primera respuesta' }
		});

		expect(screen.getByDisplayValue('First reply')).toBeTruthy();
		await fireEvent.input(screen.getAllByRole('textbox')[0], { target: { value: 'Edited reply' } });

		await rerender({
			parentReviewId: 'review-2',
			revieweePubkey: 'reviewee-b',
			revieweeLabel: 'Taylor',
			initialContent: { en: 'Second reply', es: 'Segunda respuesta' }
		});

		expect(screen.getByDisplayValue('Second reply')).toBeTruthy();
		expect(screen.getByDisplayValue('Segunda respuesta')).toBeTruthy();

		await rerender({
			parentReviewId: 'review-1',
			revieweePubkey: 'reviewee-a',
			revieweeLabel: 'Alex',
			initialContent: { en: 'First reply', es: 'Primera respuesta' }
		});

		expect(screen.getByDisplayValue('First reply')).toBeTruthy();
		expect(screen.getByDisplayValue('Primera respuesta')).toBeTruthy();
	});

	it('shows a restored draft cue and can discard it', async () => {
		const draftKey = 'reviews.reply.review-1:reviewee-pubkey';
		const storedDraft = {
			contentEn: 'Restored reply',
			contentEs: 'Respuesta restaurada',
			attachmentResults: []
		};
		const getItemSpy = vi.spyOn(window.localStorage, 'getItem').mockImplementation((key) => {
			return key === draftKey ? JSON.stringify(storedDraft) : null;
		});
		const removeItemSpy = vi
			.spyOn(window.localStorage, 'removeItem')
			.mockImplementation(() => undefined);
		const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => undefined);

		render(ReviewReplyComposer, {
			parentReviewId: 'review-1',
			revieweePubkey: 'reviewee-pubkey',
			revieweeLabel: 'Alex',
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
