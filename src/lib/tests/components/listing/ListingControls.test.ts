import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import ListingControls from '$lib/components/listing/ListingControls.svelte';

const { goto } = vi.hoisted(() => ({
	goto: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	goto
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'find_tasks.filters': 'Filters',
		'find_tasks.save': 'Save',
		'find_tasks.map': 'Map',
		'find_tasks.list': 'List',
		'find_tasks.view_map': 'View Map',
		'find_tasks.view_list': 'View List',
		'dashboard.services.browse.filters_button': 'Service Filters',
		'dashboard.services.browse.save': 'Save Search',
		'dashboard.services.browse.map': 'Map',
		'dashboard.services.browse.list': 'List',
		'dashboard.services.browse.view_map': 'View Map',
		'dashboard.services.browse.view_list': 'View List',
		'dashboard.services.browse.search_placeholder': 'Search services...'
	};

	return {
		t: readable((key: string) => translations[key] ?? key)
	};
});

describe('ListingControls', () => {
	it('renders service-scoped translations and forwards search changes', async () => {
		const onSearchInput = vi.fn();
		const { getByPlaceholderText, getByRole } = render(ListingControls, {
			searchQuery: '',
			searchInputClass: 'input input-bordered',
			searchPlaceholder: 'Search services...',
			onSearchInput,
			onFilterClick: vi.fn(),
			onSaveSearch: vi.fn().mockResolvedValue(undefined),
			canSaveSearch: true,
			viewMode: 'list',
			onToggleViewMode: vi.fn(),
			user: { npub: 'npub1example' },
			drawersLoaded: true,
			loadDrawerComponents: vi.fn().mockResolvedValue(undefined),
			translationNamespace: 'dashboard.services.browse',
			filterLabelKey: 'filters_button'
		});

		await fireEvent.input(getByPlaceholderText('Search services...'), {
			target: { value: 'logo' }
		});

		expect(onSearchInput).toHaveBeenCalledTimes(1);
		expect(getByRole('button', { name: 'Service Filters' })).toBeTruthy();
	});

	it('routes anonymous save attempts to signup', async () => {
		const { getByRole } = render(ListingControls, {
			searchQuery: '',
			searchInputClass: 'input input-bordered',
			searchPlaceholder: 'Search services...',
			onSearchInput: vi.fn(),
			onFilterClick: vi.fn(),
			onSaveSearch: vi.fn().mockResolvedValue(undefined),
			canSaveSearch: true,
			viewMode: 'list',
			onToggleViewMode: vi.fn(),
			user: null,
			drawersLoaded: true,
			loadDrawerComponents: vi.fn().mockResolvedValue(undefined),
			translationNamespace: 'dashboard.services.browse',
			filterLabelKey: 'filters_button'
		});

		await fireEvent.click(getByRole('button', { name: 'Save Search' }));
		expect(goto).toHaveBeenCalledWith('/auth/signup');
	});
});
