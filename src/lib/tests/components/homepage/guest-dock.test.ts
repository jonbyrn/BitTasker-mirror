import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import BottomNavBar from '$lib/components/BottomNavBar.svelte';
import { authState } from '$lib/stores/auth.store';

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => key),
	locale: readable('en')
}));

vi.mock('$app/state', () => ({
	page: {
		url: new URL('https://rgb.bittasker.com/'),
		params: {}
	}
}));

describe('logged-out bottom nav', () => {
	it('shows Home, Menu, Help, and Account', () => {
		authState.set({ isAuthenticated: false, isLoading: false, error: null });
		render(BottomNavBar);

		expect(screen.getByTestId('dock-home').getAttribute('href')).toBe('/');
		expect(screen.getByTestId('dock-menu')).toBeTruthy();
		expect(screen.getByTestId('dock-help').getAttribute('href')).toContain('/how-it-works');
		expect(screen.getByTestId('dock-account').getAttribute('href')).toContain('/auth/login');
		expect(screen.getByTestId('dock-account')).toHaveTextContent('navbar.dock.account');
		expect(screen.queryByTestId('dock-signup')).toBeNull();
	});
});
