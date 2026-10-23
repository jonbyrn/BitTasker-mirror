import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { addMessages } from 'svelte-i18n';

const storage = new Map<string, string>();
const revoke = vi.hoisted(() => ({ token: null as string | null }));

vi.unmock('$lib/stores/auth.store');

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => ({
			value: window.localStorage.getItem(`CapacitorStorage.${key}`)
		})),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			window.localStorage.setItem(`CapacitorStorage.${key}`, value);
		}),
		remove: vi.fn(async ({ key }: { key: string }) => {
			window.localStorage.removeItem(`CapacitorStorage.${key}`);
		}),
		clear: vi.fn(async () => undefined),
		keys: vi.fn(async () => ({ keys: [] as string[] }))
	}
}));

vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		logout: (accessToken?: string | null) => {
			revoke.token =
				accessToken ?? window.localStorage.getItem('CapacitorStorage.access_token');
			return Promise.resolve();
		}
	}
}));

vi.mock('$lib/nostr/ndk', () => ({ ndkLogout: vi.fn(async () => undefined) }));
vi.mock('$lib/runes/ndkIdentity.svelte', () => ({ ndkIdentity: { reset: vi.fn() } }));
vi.mock('$lib/utils/session', () => ({ destroySession: vi.fn(async () => undefined) }));
vi.mock('$lib/api/services/notificationSocket.service', () => ({
	disconnectNotificationSocket: vi.fn()
}));
vi.mock('$lib/utils/helpers/e2eBiometricState', () => ({
	clearPersistedE2EBiometricData: vi.fn(async () => undefined)
}));
vi.mock('$lib/utils/helpers/onboarding-draft', () => ({ clearOnboardingDraft: vi.fn() }));
vi.mock('$lib/utils/helpers/session-mnemonic', () => ({
	clearKeySessions: vi.fn(async () => undefined)
}));
vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		update: vi.fn((updater: (state: { toasts: unknown[] }) => { toasts: unknown[] }) =>
			updater({ toasts: [] })
		),
		subscribe: vi.fn(),
		resetUserState: vi.fn()
	}
}));

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
		getUserData: vi.fn(async () => undefined),
		updateProfile: vi.fn()
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

addMessages('en', {
	navbar: { logout: 'Logout' },
	common: {
		components: {
			confirm_modal: {
				logout: { title: 'Confirm Logout', message: 'Are you sure you want to log out?' },
				confirm: 'Confirm',
				cancel: 'Cancel'
			}
		}
	}
});

import ProtectedTopBar from '$lib/components/topbar/ProtectedTopBar.svelte';

function installStorage() {
	storage.clear();
	vi.mocked(localStorage.getItem).mockImplementation((key: string) => storage.get(key) ?? null);
	vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
		storage.set(key, value);
	});
	vi.mocked(localStorage.removeItem).mockImplementation((key: string) => {
		storage.delete(key);
	});
}

describe('logout session', () => {
	beforeEach(() => {
		installStorage();
		revoke.token = null;
		localStorage.setItem('CapacitorStorage.access_token', 'access-token');
		localStorage.setItem('access_token', 'access-token');
		localStorage.setItem('CapacitorStorage.refresh_token', 'refresh-token');
		localStorage.setItem('CapacitorStorage.npub', 'npub1example');
	});

	it('clears storage after the logout confirm so a reload stays logged out', async () => {
		render(ProtectedTopBar);
		const avatar = document.querySelector('.header-avatar-btn');
		expect(avatar).toBeTruthy();
		await fireEvent.click(avatar as HTMLElement);
		await fireEvent.click(await screen.findByRole('button', { name: 'Logout' }));

		expect(screen.getAllByRole('heading', { name: 'Confirm Logout' })).toHaveLength(1);
		expect(screen.queryByRole('heading', { name: 'Log out?' })).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

		await vi.waitFor(() => {
			expect(localStorage.getItem('CapacitorStorage.access_token')).toBeNull();
			expect(localStorage.getItem('CapacitorStorage.refresh_token')).toBeNull();
			expect(localStorage.getItem('CapacitorStorage.npub')).toBeNull();
		});

		vi.resetModules();
		const { authState: reloaded } = await import('$lib/stores/auth.store');
		await vi.waitFor(() => {
			expect(get(reloaded).isLoading).toBe(false);
		});
		expect(get(reloaded).isAuthenticated).toBe(false);
		expect(localStorage.getItem('CapacitorStorage.access_token')).toBeNull();
	});
});
