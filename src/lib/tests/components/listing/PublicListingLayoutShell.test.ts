import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import PublicListingLayoutShell from '$lib/components/listing/PublicListingLayoutShell.svelte';

const { pageState, auth, sections, translations } = vi.hoisted(() => ({
	pageState: {
		url: new URL('https://bittasker.com/services'),
		params: {}
	},
	auth: { isAuthenticated: true, isLoading: false, error: null as string | null },
	sections: [
		{
			id: 'find-tasks',
			path: '/tasks',
			icon: 'mdi:magnify',
			label: 'nav.find_tasks'
		},
		{
			id: 'find-services',
			path: '/services',
			icon: 'mdi:briefcase-search',
			label: 'nav.find_services'
		}
	],
	translations: {
		'nav.find_tasks': 'Find Tasks',
		'nav.find_services': 'Find Services'
	}
}));

vi.mock('$app/state', () => ({
	page: pageState
}));

vi.mock('$lib/stores/device.store', () => ({
	devicePlatform: readable('desktop')
}));

vi.mock('$lib/stores/auth.store', () => ({
	authState: readable(auth)
}));

vi.mock('$lib/stores/user.store', () => ({
	user: readable({ npub: 'npub1example' })
}));

vi.mock('$lib/utils/consts', () => ({
	sections
}));

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => translations[key as keyof typeof translations] ?? key)
}));

describe('PublicListingLayoutShell', () => {
	beforeEach(() => {
		Object.defineProperty(window, 'innerWidth', {
			value: 1400,
			writable: true,
			configurable: true
		});
		pageState.url = new URL('https://bittasker.com/services');
		auth.isAuthenticated = true;
	});

	it('shows the authenticated desktop sidebar and marks the active listing section', async () => {
		render(PublicListingLayoutShell, {
			activeSectionId: 'find-services',
			activeBasePath: '/services',
			layoutClassName: 'services-layout'
		});

		await waitFor(() => expect(screen.getByRole('link', { name: 'Find Services' })).toBeTruthy());

		expect(screen.getByRole('link', { name: 'Find Tasks' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Find Services' })).toHaveClass('menu-active');
	});

	it('hides the sidebar on detail routes even on desktop', async () => {
		render(PublicListingLayoutShell, {
			activeSectionId: 'find-services',
			activeBasePath: '/services',
			layoutClassName: 'services-layout',
			isDetailsRoute: true
		});

		await waitFor(() => expect(document.querySelector('.services-layout')).toBeTruthy());
		expect(screen.queryByRole('link', { name: 'Find Services' })).toBeNull();
		expect(screen.getByTestId('listing-detail')).toBeTruthy();
	});

	it('keeps Hiring and Earning off the logged-out listing page', async () => {
		auth.isAuthenticated = false;
		render(PublicListingLayoutShell, {
			activeSectionId: 'find-services',
			activeBasePath: '/services',
			layoutClassName: 'services-layout'
		});

		await waitFor(() => expect(document.querySelector('.services-layout')).toBeTruthy());
		expect(screen.queryByRole('link', { name: 'Find Services' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Find Tasks' })).toBeNull();
	});
});
