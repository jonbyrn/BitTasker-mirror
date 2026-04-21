import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ReviewSummaryCard from '$lib/components/profile/ReviewSummaryCard.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

describe('ReviewSummaryCard', () => {
	it('renders average, total reviews, and category groups', () => {
		render(ReviewSummaryCard, {
			stats: {
				averageRating: 4.6,
				totalReviews: 10,
				ratingDistribution: { 1: 1, 2: 0, 3: 1, 4: 2, 5: 6 },
				categoryGroups: [
					{
						id: 'taskee',
						heading: 'As a taskee',
						categories: [{ id: 'quality', label: 'Quality', value: 4.8 }]
					}
				]
			}
		});

		expect(screen.getByText('4.6')).toBeTruthy();
		expect(screen.getByText('10')).toBeTruthy();
		expect(screen.getByText('As a taskee')).toBeTruthy();
		expect(screen.getByText('Quality')).toBeTruthy();
	});
});
