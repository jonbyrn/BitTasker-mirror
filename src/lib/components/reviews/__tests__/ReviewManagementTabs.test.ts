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
	it('renders scrollable, non-wrapping tabs for current users', () => {
		const { container } = render(ReviewManagementTabs, {
			props: {
				activeTab: 'received',
				receivedCount: 12,
				givenCount: 4,
				pendingCount: 11,
				isCurrentUser: true,
				idPrefix: 'dashboard-reviews'
			}
		});

		const scrollContainer = container.querySelector('.overflow-x-auto');
		expect(scrollContainer).not.toBeNull();

		const tablist = screen.getByRole('tablist', { name: 'Review Management' });
		expect(tablist).toHaveClass('inline-flex');
		expect(tablist).toHaveClass('min-w-full');

		const pendingTab = screen.getByRole('tab', { name: /Pending/ });
		expect(pendingTab).toHaveClass('shrink-0');
		expect(pendingTab).toHaveClass('whitespace-nowrap');
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
