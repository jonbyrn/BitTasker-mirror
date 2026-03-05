/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ReviewsEmptyState from '../ReviewsEmptyState.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

describe('ReviewsEmptyState', () => {
	it('renders no-reviews message and hint by default', () => {
		render(ReviewsEmptyState);
		expect(screen.getByText('reviews.list.no_reviews')).toBeInTheDocument();
		expect(screen.getByText('reviews.list.no_reviews_hint')).toBeInTheDocument();
	});

	it('hides hint when showHint is false', () => {
		render(ReviewsEmptyState, { props: { showHint: false } });
		expect(screen.getByText('reviews.list.no_reviews')).toBeInTheDocument();
		expect(screen.queryByText('reviews.list.no_reviews_hint')).not.toBeInTheDocument();
	});

	it('has role="status" for accessibility', () => {
		const { container } = render(ReviewsEmptyState);
		const status = container.querySelector('[role="status"]');
		expect(status).toBeInTheDocument();
	});
});
