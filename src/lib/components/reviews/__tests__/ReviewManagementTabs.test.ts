import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import ReviewManagementTabs from '../ReviewManagementTabs.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');

	const translations: Record<string, string> = {
		'reviews.management.title': 'Review Management',
		'reviews.tabs.received': 'Received',
		'reviews.tabs.given': 'Given',
		'reviews.tabs.pending': 'Pending'
	};

	return {
		t: readable((key: string) => translations[key] ?? key)
	};
});

describe('ReviewManagementTabs', () => {
	it('renders grid-based tabs-bordered layout for current users', () => {
		render(ReviewManagementTabs, {
			props: {
				activeTab: 'received',
				receivedCount: 12,
				givenCount: 4,
				pendingCount: 11,
				isCurrentUser: true,
				idPrefix: 'dashboard-reviews'
			}
		});

		const tablist = screen.getByRole('tablist', { name: 'Review Management' });
		expect(tablist).toHaveClass('grid');
		expect(tablist).toHaveClass('grid-cols-3');
		expect(tablist).toHaveClass('tabs-bordered');

		expect(screen.getByRole('tab', { name: /Received/ })).toHaveAttribute(
			'aria-controls',
			'dashboard-reviews-panel-received'
		);
	});

	it('changes tabs with keyboard navigation and hides private tabs for other users', async () => {
		const onTabChange = vi.fn();
		render(ReviewManagementTabs, {
			props: {
				activeTab: 'received',
				receivedCount: 3,
				isCurrentUser: false,
				onTabChange
			}
		});

		const receivedTab = screen.getByRole('tab', { name: /Received/ });
		expect(screen.queryByRole('tab', { name: /Given/ })).not.toBeInTheDocument();
		expect(screen.queryByRole('tab', { name: /Pending/ })).not.toBeInTheDocument();

		await fireEvent.keyDown(receivedTab, { key: 'Home' });
		expect(onTabChange).toHaveBeenCalledWith('received');
	});
});
