import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { authState } from '$lib/stores/auth.store';
import LanguageDropdown from '$lib/components/LanguageDropdown.svelte';
import ProtectedTopBar from '$lib/components/topbar/ProtectedTopBar.svelte';

vi.mock('$lib/stores/user.store', () => {
	const { writable } = require('svelte/store');
	const store = writable({ name: 'Ada Lovelace', username: 'ada', npub: '' });
	return {
		user: {
			subscribe: store.subscribe,
			getUserData: vi.fn().mockResolvedValue(undefined),
			updateProfile: vi.fn()
		}
	};
});

vi.mock('$lib/stores/profile.store', () => {
	const { writable } = require('svelte/store');
	const store = writable({ data: null });
	return {
		profileStore: {
			subscribe: store.subscribe,
			init: vi.fn()
		}
	};
});

describe('header menus', () => {
	beforeEach(() => {
		vi.mocked(authState.logout).mockClear();
	});

	it('opens the language switcher on the first click', async () => {
		render(LanguageDropdown, { props: { showTooltip: false } });
		expect(screen.queryByTestId('language-menu')).toBeNull();

		await fireEvent.click(screen.getByTestId('language-switcher'));

		expect(screen.getByTestId('language-menu')).toBeInTheDocument();
		expect(screen.getByTestId('language-switcher')).toHaveAttribute('aria-expanded', 'true');
	});

	it('keeps the language menu open when pointerdown is followed by click', async () => {
		render(LanguageDropdown, { props: { showTooltip: false } });
		const button = screen.getByTestId('language-switcher');

		await fireEvent.pointerDown(button);
		await fireEvent.click(button);

		expect(screen.getByTestId('language-menu')).toBeInTheDocument();
	});

	it('opens the avatar menu on the first click and logs out from it', async () => {
		render(ProtectedTopBar);
		expect(screen.queryByTestId('avatar-menu')).toBeNull();
		expect(screen.queryByTestId('nav-browse-tasks')).toBeNull();

		const nav = screen.getByTestId('logged-in-nav');
		expect(nav.className).not.toContain('overflow-x-auto');
		expect(nav.querySelector('ul')?.className).toContain('flex-nowrap');

		const avatar = screen.getByTestId('avatar-menu-button');
		await fireEvent.pointerDown(avatar);
		await fireEvent.click(avatar);
		expect(screen.getByTestId('avatar-menu')).toBeInTheDocument();

		await fireEvent.click(screen.getByTestId('avatar-logout'));
		await fireEvent.click(screen.getByText('common.components.confirm_modal.confirm'));

		expect(authState.logout).toHaveBeenCalledOnce();
	});
});
