import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
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
	it('shows the filter dropdown by default and can switch to service alerts', async () => {
		render(DashboardSavedSearchesPanel);

		// The dropdown trigger shows the current filter
		expect(screen.getByRole('button', { name: 'dashboard.saved_searches.tasks' })).toBeTruthy();
		expect(document.getElementById('panel-saved-tasks')).toBeTruthy();
		expect(document.getElementById('panel-saved-services')).toBeNull();

		// Open the dropdown and select services
		await fireEvent.click(screen.getByRole('button', { name: 'dashboard.saved_searches.tasks' }));
		const listbox = screen.getByRole('listbox');
		const options = within(listbox).getAllByRole('button');
		await fireEvent.click(options[1]); // services option

		expect(document.getElementById('panel-saved-services')).toBeTruthy();
		expect(document.getElementById('panel-saved-tasks')).toBeNull();
	});

	it('hides the filter dropdown and locks to task alerts when fixedFilter is tasks', () => {
		render(DashboardSavedSearchesPanel, {
			fixedFilter: 'tasks'
		});

		// When fixedFilter is set, the DashboardFilterBar (which contains dropdown) is not rendered
		expect(screen.queryByRole('button', { name: 'dashboard.saved_searches.tasks' })).toBeNull();
		expect(document.getElementById('panel-saved-tasks')).toBeTruthy();
		expect(document.getElementById('panel-saved-services')).toBeNull();
	});
});
