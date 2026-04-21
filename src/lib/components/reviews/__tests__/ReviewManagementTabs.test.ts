import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ReviewManagementTabs from '$lib/components/reviews/ReviewManagementTabs.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

describe('ReviewManagementTabs', () => {
	it('shows all tabs for the current user with counts', () => {
		render(ReviewManagementTabs, {
			activeTab: 'received',
			receivedCount: 4,
			givenCount: 2,
			pendingCount: 1,
			isCurrentUser: true
		});

		expect(screen.getByText('reviews.tabs.received')).toBeTruthy();
		expect(screen.getByText('reviews.tabs.given')).toBeTruthy();
		expect(screen.getByText('reviews.tabs.pending')).toBeTruthy();
		expect(screen.getByText('4')).toBeTruthy();
		expect(screen.getByText('2')).toBeTruthy();
		expect(screen.getByText('1')).toBeTruthy();

		const tabs = screen.getAllByRole('tab');
		expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
			'reviews.tabs.pending 1',
			'reviews.tabs.received 4',
			'reviews.tabs.given 2'
		]);
	});

	it('shows only received reviews for other users', () => {
		render(ReviewManagementTabs, {
			activeTab: 'received',
			receivedCount: 4,
			isCurrentUser: false
		});

		expect(screen.getByText('reviews.tabs.received')).toBeTruthy();
		expect(screen.queryByText('reviews.tabs.given')).toBeNull();
		expect(screen.queryByText('reviews.tabs.pending')).toBeNull();
	});
});
