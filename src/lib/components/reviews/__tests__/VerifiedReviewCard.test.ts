/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import VerifiedReviewCard from '../VerifiedReviewCard.svelte';
import type { NostrVerifiedReview } from '$lib/types/review';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/stores/translation.store', () => ({
	TranslationStore: {
		getDisplayText: vi.fn((_id: string, text: string) => text)
	}
}));

describe('VerifiedReviewCard', () => {
	const mockReview: NostrVerifiedReview = {
		reviewerPubkey: 'npub1reviewer',
		revieweePubkey: 'npub1reviewee',
		content: {
			overallRating: 5,
			categoryRatings: {
				quality: 5,
				professionalism: 4,
				timeliness: 5
			},
			comment: 'Great work!',
			photos: []
		},
		createdAt: Date.now(),
		nostrEventId: 'event-123',
		nostrRelay: 'relay-url'
	};

	it('should render review card', () => {
		render(VerifiedReviewCard, { props: { review: mockReview } });

		expect(screen.getByText('Great work!')).toBeInTheDocument();
		expect(screen.getByText(/5.0/i)).toBeInTheDocument();
	});

	it('should display category ratings', () => {
		render(VerifiedReviewCard, { props: { review: mockReview } });

		expect(screen.getByText(/Quality/i)).toBeInTheDocument();
		expect(screen.getByText(/Professionalism/i)).toBeInTheDocument();
		expect(screen.getByText(/Timeliness/i)).toBeInTheDocument();
	});

	it('should show reply button when onReply is provided', () => {
		const onReply = vi.fn();
		render(VerifiedReviewCard, { props: { review: mockReview, onReply } });

		expect(screen.getByText(/Reply/i)).toBeInTheDocument();
	});
});
