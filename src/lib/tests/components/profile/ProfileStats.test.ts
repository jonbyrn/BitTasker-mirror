import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ProfileStats from '$lib/components/profile/ProfileStats.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

const stats = {
	tasksCompleted: 12,
	contractsCompleted: 8,
	activeServices: 4,
	rating: 4.9,
	responseRate: 96,
	onTimeRate: 91
};

describe('ProfileStats', () => {
	it('renders the completed contract count', () => {
		const { getByTestId } = render(ProfileStats, {
			stats,
			serviceCountState: 'ready'
		});

		expect(getByTestId('profile-stats-contracts-completed').textContent).toBe('8');
	});

	it('renders the active services count when the service metric is ready', () => {
		const { getByTestId } = render(ProfileStats, {
			stats,
			serviceCountState: 'ready'
		});

		expect(getByTestId('profile-stats-active-services').textContent).toBe('4');
	});

	it('renders the loading label while the services metric is pending', () => {
		const { getByTestId } = render(ProfileStats, {
			stats,
			serviceCountState: 'loading'
		});

		expect(getByTestId('profile-stats-active-services').textContent).toBe(
			'profile.services_summary.count_loading'
		);
	});

	it('renders the unavailable label when the services metric fails', () => {
		const { getByTestId } = render(ProfileStats, {
			stats,
			serviceCountState: 'error'
		});

		expect(getByTestId('profile-stats-active-services').textContent).toBe(
			'profile.services_summary.count_unavailable'
		);
	});
});
