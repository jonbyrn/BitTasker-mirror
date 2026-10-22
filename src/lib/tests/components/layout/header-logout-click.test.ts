import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addMessages } from 'svelte-i18n';
import { authState } from '$lib/stores/auth.store';

addMessages('en', {
	navbar: { logout: 'Logout' },
	common: {
		components: {
			confirm_modal: {
				logout: {
					title: 'Log out?',
					message: 'End this session?',
					confirm_button: 'Log out'
				},
				confirm: 'Confirm',
				cancel: 'Cancel'
			}
		}
	}
});

vi.mock('$app/state', () => ({
	page: {
		url: new URL('https://rgb.bittasker.com/hiring/my-tasks'),
		route: { id: '/(app)/(protected)/hiring/my-tasks' },
		params: {},
		data: {}
	}
}));

vi.mock('$lib/stores/user.store', () => ({
	user: {
		subscribe: (fn: (value: Record<string, string>) => void) => {
			fn({ name: 'Ada', username: 'ada' });
			return () => undefined;
		},
		getUserData: vi.fn(async () => undefined)
	}
}));

vi.mock('$lib/stores/profile.store', () => ({
	profileStore: {
		subscribe: (fn: (value: { data: null }) => void) => {
			fn({ data: null });
			return () => undefined;
		},
		init: vi.fn()
	}
}));

import ProtectedTopBar from '$lib/components/topbar/ProtectedTopBar.svelte';

describe('header logout', () => {
	beforeEach(() => {
		authState.set({ isAuthenticated: true, isLoading: false, error: null });
		vi.mocked(authState.logout).mockClear();
	});

	it('opens the confirm on one avatar click and one Logout click', async () => {
		render(ProtectedTopBar);
		const avatar = document.querySelector('.header-avatar-btn');
		expect(avatar).toBeTruthy();
		await fireEvent.click(avatar as HTMLElement);
		const logout = await screen.findByRole('button', { name: 'Logout' });
		await fireEvent.click(logout);
		expect(screen.getByText('Log out?')).toBeInTheDocument();
		expect(authState.logout).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
		expect(authState.logout).toHaveBeenCalledOnce();
	});

	it('leaves the session when Cancel is clicked', async () => {
		render(ProtectedTopBar);
		const avatar = document.querySelector('.header-avatar-btn');
		await fireEvent.click(avatar as HTMLElement);
		await fireEvent.click(await screen.findByRole('button', { name: 'Logout' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(authState.logout).not.toHaveBeenCalled();
		expect(screen.queryByText('Log out?')).not.toBeInTheDocument();
	});
});
