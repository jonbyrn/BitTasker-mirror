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
	it('shows Home, About, Menu, Help, and Sign Up', () => {
		authState.set({ isAuthenticated: false, isLoading: false, error: null });
		render(BottomNavBar);

		expect(screen.getByTestId('dock-home').getAttribute('href')).toBe('/');
		expect(screen.getByTestId('dock-about').getAttribute('href')).toContain('/about');
		expect(screen.getByTestId('dock-about')).toHaveTextContent('navbar.dock.about');
		expect(screen.getByTestId('dock-menu')).toBeTruthy();
		expect(screen.getByTestId('dock-help').getAttribute('href')).toContain('/how-it-works');
		expect(screen.getByTestId('dock-signup').getAttribute('href')).toContain('/auth/signup');
		expect(screen.getByTestId('dock-signup')).toHaveTextContent('navbar.dock.signup');
		expect(screen.queryByTestId('dock-account')).toBeNull();
	});
});
