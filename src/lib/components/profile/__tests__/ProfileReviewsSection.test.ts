import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProfileReviewsSection from '$lib/components/profile/ProfileReviewsSection.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, options?: { values?: Record<string, string | number> }) => {
			const table: Record<string, string> = {
				'reviews.summary.title': 'Review Summary',
				'reviews.management.title': 'Review Management',
				'reviews.tabs.received': 'Received',
				'reviews.tabs.given': 'Given',
				'reviews.tabs.pending': 'Pending',
				'reviews.list.no_reviews': 'No reviews yet',
				'reviews.list.no_given_reviews': 'No given reviews',
				'reviews.pending.no_pending': 'No pending reviews'
			};
			const template = table[key] ?? key;
			return template.replace(/\{(\w+)\}/g, (_, name) => String(options?.values?.[name] ?? ''));
		}),
		locale: readable('en')
	};
});

describe('ProfileReviewsSection', () => {
	it('renders the summary and the correct active list view', () => {
		render(ProfileReviewsSection, {
			userPubkey: 'user-pubkey',
			isCurrentUser: true,
			activeTab: 'pending',
			stats: {
				averageRating: 4.5,
				totalReviews: 2,
				ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
				categoryGroups: []
			},
			receivedReviews: [],
			givenReviews: [],
			pendingReviews: [
				{
					id: 'pending-1',
					revieweePubkey: 'reviewee',
					subjectType: 'task',
					settlementType: 'escrow',
					contractOutcome: 'completed',
					createdAt: 1
				}
			]
		});

		expect(screen.getByText('Review Summary')).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'Pending 1' })).toBeTruthy();
		expect(screen.getByText('reviews.profile.user_label: user-pubkey')).toBeTruthy();
	});
});
