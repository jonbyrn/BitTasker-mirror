import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import DashboardSavedSearchesPanel from '$lib/components/task/DashboardSavedSearchesPanel.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/components/task/DashboardSavedTaskSearchesPanel.svelte', () => ({
	default: () => ({
		$$render: () => ''
	})
}));

vi.mock('$lib/components/service/DashboardSavedServiceSearchesPanel.svelte', () => ({
	default: () => ({
		$$render: () => ''
	})
}));

describe('DashboardSavedSearchesPanel', () => {
	it('shows the filter tabs by default and can switch to service alerts', async () => {
		render(DashboardSavedSearchesPanel);

		expect(screen.getByRole('tab', { name: 'dashboard.saved_searches.tasks' })).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'dashboard.saved_searches.services' })).toBeTruthy();
		expect(document.getElementById('panel-saved-tasks')).toBeTruthy();
		expect(document.getElementById('panel-saved-services')).toBeNull();

		await fireEvent.click(screen.getByRole('tab', { name: 'dashboard.saved_searches.services' }));

		expect(document.getElementById('panel-saved-services')).toBeTruthy();
		expect(document.getElementById('panel-saved-tasks')).toBeNull();
	});

	it('hides the filter tabs and locks to task alerts when fixedFilter is tasks', () => {
		render(DashboardSavedSearchesPanel, {
			fixedFilter: 'tasks'
		});

		expect(screen.queryByRole('tablist')).toBeNull();
		expect(document.getElementById('panel-saved-tasks')).toBeTruthy();
		expect(document.getElementById('panel-saved-services')).toBeNull();
	});
});
