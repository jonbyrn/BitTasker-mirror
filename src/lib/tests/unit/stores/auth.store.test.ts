import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import { StorageKeys } from '$lib/utils/constants/storage';

// Unmock the globally mocked auth store so we test the real implementation
vi.unmock('$lib/stores/auth.store');
const { authState } = await import('$lib/stores/auth.store');

const mockDestroySession = vi.fn().mockResolvedValue(undefined);
const mockAuthServiceLogout = vi.fn().mockResolvedValue(undefined);
const mockNdkLogout = vi.fn().mockResolvedValue(undefined);
const { mockResetNdkIdentity } = vi.hoisted(() => ({
	mockResetNdkIdentity: vi.fn()
}));

vi.mock('$lib/runes/ndkIdentity.svelte', () => ({
	ndkIdentity: {
		reset: (...args: unknown[]) => mockResetNdkIdentity(...args)
	}
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		remove: vi.fn().mockResolvedValue(undefined),
		set: vi.fn().mockResolvedValue(undefined),
		get: vi.fn().mockResolvedValue({ value: null })
	}
}));

vi.mock('$lib/utils/session', () => ({
	destroySession: (...args: unknown[]) => mockDestroySession(...args)
}));

vi.mock('$lib/nostr/ndk', () => ({
	ndkLogout: (...args: unknown[]) => mockNdkLogout(...args)
}));

vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		logout: (...args: unknown[]) => mockAuthServiceLogout(...args)
	}
}));

let mockAppStoreState = {
	toasts: [
		{ id: 1, type: 'banner', message: 'Banner 1' },
		{ id: 2, type: 'success', message: 'Toast' },
		{ id: 3, type: 'banner', message: 'Banner 2' }
	]
};
const mockAppStoreUpdate = vi.fn<(updater: (state: typeof mockAppStoreState) => typeof mockAppStoreState) => void>((updater) => {
	mockAppStoreState = updater(mockAppStoreState);
});
vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		update: (updater: unknown) =>
			mockAppStoreUpdate(
				updater as unknown as (state: typeof mockAppStoreState) => typeof mockAppStoreState
			),
		subscribe: vi.fn()
	}
}));

vi.mock('$lib/stores/user.store', () => ({
	user: { reset: vi.fn(), updateProfile: vi.fn() }
}));

vi.mock('$lib/stores/mute.store', () => ({
	muteStore: { reset: vi.fn() }
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn().mockResolvedValue(undefined)
}));

describe('auth.store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authState.set({
			isAuthenticated: false,
			isLoading: false,
			error: null
		});
		mockAppStoreState = {
			toasts: [
				{ id: 1, type: 'banner', message: 'Banner 1' },
				{ id: 2, type: 'success', message: 'Toast' },
				{ id: 3, type: 'banner', message: 'Banner 2' }
			]
		};
	});

	describe('initial and sync updates', () => {
		it('should set loading state', () => {
			authState.setLoading(true);
			expect(get(authState).isLoading).toBe(true);
			authState.setLoading(false);
			expect(get(authState).isLoading).toBe(false);
		});

		it('should set error state', () => {
			authState.setError('Invalid credentials');
			expect(get(authState).error).toBe('Invalid credentials');
			authState.setError(null);
			expect(get(authState).error).toBe(null);
		});

		it('should set authenticated and clear error on login', async () => {
			authState.setError('Previous error');
			await authState.login();
			const state = get(authState);
			expect(state.isAuthenticated).toBe(true);
			expect(state.error).toBe(null);
		});
	});

	describe('logout', () => {
		it('should reset auth state to initial after logout', async () => {
			authState.set({ isAuthenticated: true, isLoading: false, error: 'Some error' });
			await authState.logout();
			const state = get(authState);
			expect(state.isAuthenticated).toBe(false);
			expect(state.isLoading).toBe(false);
			expect(state.error).toBe(null);
		});

		it('should call authService.logout() to revoke token on the server', async () => {
			await authState.logout();
			expect(mockAuthServiceLogout).toHaveBeenCalledOnce();
		});

		it('should call destroySession() for local cleanup', async () => {
			await authState.logout();
			expect(mockDestroySession).toHaveBeenCalledOnce();
		});

		it('should call ndkLogout() after authService.logout', async () => {
			await authState.logout();
			expect(mockNdkLogout).toHaveBeenCalledOnce();
		});

		it('should call ndkIdentity.reset after ndkLogout', async () => {
			await authState.logout();
			expect(mockResetNdkIdentity).toHaveBeenCalledOnce();
		});

		it('should dismiss all open banners on logout', async () => {
			await authState.logout();
			expect(mockAppStoreUpdate).toHaveBeenCalledOnce();
			expect(mockAppStoreState.toasts).toEqual([
				{ id: 2, type: 'success', message: 'Toast' }
			]);
		});

		it('drops the access token before the server logout finishes', async () => {
			const storage = new Map<string, string>();
			vi.mocked(localStorage.getItem).mockImplementation((key: string) => storage.get(key) ?? null);
			vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
				storage.set(key, value);
			});
			vi.mocked(localStorage.removeItem).mockImplementation((key: string) => {
				storage.delete(key);
			});
			localStorage.setItem('CapacitorStorage.access_token', 'access-token');
			localStorage.setItem('access_token', 'access-token');
			authState.set({ isAuthenticated: true, isLoading: false, error: 'still in' });

			let duringServerLogout: { token: string | null; signedIn: boolean } | null = null;
			mockAuthServiceLogout.mockImplementation(async () => {
				duringServerLogout = {
					token: localStorage.getItem('CapacitorStorage.access_token'),
					signedIn: get(authState).isAuthenticated
				};
			});

			await authState.logout();

			expect(duringServerLogout).toEqual({ token: null, signedIn: false });
			expect(localStorage.getItem('access_token')).toBeNull();
			vi.mocked(localStorage.getItem).mockImplementation(() => null);
			vi.mocked(localStorage.setItem).mockImplementation(() => undefined);
			vi.mocked(localStorage.removeItem).mockImplementation(() => undefined);
		});

		it('should call destroySession after authService.logout and ndkLogout', async () => {
			const callOrder: string[] = [];
			mockAuthServiceLogout.mockImplementation(async () => {
				callOrder.push('server');
			});
			mockNdkLogout.mockImplementation(async () => {
				callOrder.push('ndk');
			});
			mockResetNdkIdentity.mockImplementation(() => {
				callOrder.push('ndkIdentity');
			});
			mockDestroySession.mockImplementation(async () => {
				callOrder.push('local');
			});

			await authState.logout();
			expect(callOrder).toEqual(['server', 'ndk', 'ndkIdentity', 'local']);
		});

		it('clears the stored session and keys when logout steps throw', async () => {
			const { Preferences } = await import('@capacitor/preferences');
			localStorage.setItem('CapacitorStorage.access_token', 'access-token');
			localStorage.setItem('access_token', 'access-token');
			localStorage.setItem('CapacitorStorage.refresh_token', 'refresh-token');
			localStorage.setItem('CapacitorStorage.npub', 'npub-value');
			localStorage.setItem('CapacitorStorage.auth_method', 'passkey');
			localStorage.setItem('CapacitorStorage.webAuthnCredentialId', 'cred-1');
			localStorage.setItem(StorageKeys.USER_PROFILE, '{"name":"Ada"}');
			authState.set({ isAuthenticated: true, isLoading: false, error: 'still in' });

			mockAuthServiceLogout.mockImplementationOnce(async () => {
				throw new Error('server');
			});
			mockNdkLogout.mockImplementationOnce(async () => {
				throw new Error('ndk');
			});
			mockDestroySession.mockImplementationOnce(async () => {
				throw new Error('wallet cleanup');
			});

			await authState.logout();

			const state = get(authState);
			expect(state.isAuthenticated).toBe(false);
			expect(state.isLoading).toBe(false);
			expect(state.error).toBe(null);
			expect(mockDestroySession).toHaveBeenCalledOnce();
			for (const key of [
				'access_token',
				'refresh_token',
				'npub',
				'auth_method',
				'webAuthnCredentialId'
			]) {
				expect(Preferences.remove).toHaveBeenCalledWith({ key });
				expect(localStorage.getItem(key)).toBeNull();
				expect(localStorage.getItem(`CapacitorStorage.${key}`)).toBeNull();
			}
			expect(localStorage.getItem(StorageKeys.USER_PROFILE)).toBeNull();
		});
	});

	describe('post-login redirect', () => {
		beforeEach(() => {
			vi.mocked(goto).mockClear();
			window.history.replaceState({}, '', '/auth/login');
		});

		async function finishLogin(): Promise<void> {
			await authState.setupAuthData('access-token', 'passkey', 'npub-value', {}, undefined, true);
		}

		it('opens a valid internal returnTo path', async () => {
			window.history.replaceState({}, '', '/auth/login?returnTo=/messages/to/abc');
			await finishLogin();
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/messages/to/abc');
		});

		it('opens /tasks when returnTo is missing', async () => {
			await finishLogin();
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/tasks');
			expect(vi.mocked(goto)).not.toHaveBeenCalledWith('/hiring');
			expect(vi.mocked(goto)).not.toHaveBeenCalledWith('/hiring/my-tasks');
		});

		it('opens /tasks when returnTo is an external or protocol-relative url', async () => {
			window.history.replaceState({}, '', '/auth/login?returnTo=https://evil.example/phish');
			await finishLogin();
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/tasks');

			vi.mocked(goto).mockClear();
			window.history.replaceState({}, '', '/auth/login?returnTo=//evil.example');
			await finishLogin();
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/tasks');
		});
	});
});
