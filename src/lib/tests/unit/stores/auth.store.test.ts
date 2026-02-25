import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { authState } from '$lib/stores/auth.store';

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		remove: vi.fn().mockResolvedValue(undefined),
		set: vi.fn().mockResolvedValue(undefined),
		get: vi.fn().mockResolvedValue({ value: null })
	}
}));

vi.mock('$lib/utils/session', () => ({
	clearSession: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/user.store', () => ({
	user: {
		reset: vi.fn(),
		updateProfile: vi.fn()
	}
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$app/paths', () => ({
	resolve: vi.fn((path: string) => path)
}));

vi.mock('$lib/utils/houdini/plugins/customAuthPlugin', () => ({
	clearPluginTokenCache: vi.fn(),
	setAccessToken: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		update: vi.fn()
	}
}));

vi.mock('$lib/utils/helpers/migratePasskey', () => ({
	resetMigration: vi.fn()
}));

describe('auth.store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authState.set({
			isAuthenticated: false,
			isLoading: false,
			error: null
		});
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

		it('should call clearSession on logout', async () => {
			const { clearSession } = await import('$lib/utils/session');
			await authState.logout();
			expect(clearSession).toHaveBeenCalled();
		});

		it('should call user.reset on logout', async () => {
			const { user } = await import('$lib/stores/user.store');
			await authState.logout();
			expect(user.reset).toHaveBeenCalled();
		});

		it('should remove access token from preferences on logout', async () => {
			const { Preferences } = await import('@capacitor/preferences');
			await authState.logout();
			expect(Preferences.remove).toHaveBeenCalledWith(
				expect.objectContaining({ key: expect.any(String) })
			);
			const removeCalls = vi.mocked(Preferences.remove).mock.calls;
			const keysRemoved = removeCalls.map((c) => c[0].key);
			expect(keysRemoved).toContain('access_token');
			expect(keysRemoved).toContain('npub');
			expect(keysRemoved).toContain('auth_method');
		});

		it('should call clearPluginTokenCache on logout', async () => {
			const { clearPluginTokenCache } = await import('$lib/utils/houdini/plugins/customAuthPlugin');
			await authState.logout();
			expect(clearPluginTokenCache).toHaveBeenCalled();
		});
	});

	describe('setupAuthData', () => {
		it('should call setAccessToken with the provided accessToken', async () => {
			const { setAccessToken } = await import('$lib/utils/houdini/plugins/customAuthPlugin');
			await authState.setupAuthData(
				'token-123',
				'passkey',
				'npub1abc',
				{ display_name: 'Test' },
				undefined,
				false
			);
			expect(setAccessToken).toHaveBeenCalledWith('token-123');
		});

		it('should set NPUB in Preferences', async () => {
			const { Preferences } = await import('@capacitor/preferences');
			await authState.setupAuthData('token', 'passkey', 'npub1xyz', {}, undefined, false);
			expect(Preferences.set).toHaveBeenCalledWith({
				key: 'npub',
				value: 'npub1xyz'
			});
		});

		it('should set authenticated state via login()', async () => {
			await authState.setupAuthData('token', 'passkey', 'npub1', {}, undefined, false);
			expect(get(authState).isAuthenticated).toBe(true);
		});

		it('when redirect is true should run resetMigration, set AUTH_METHOD, user.updateProfile, then goto', async () => {
			const { goto } = await import('$app/navigation');
			const { resolve: resolvePath } = await import('$app/paths');
			const { resetMigration } = await import('$lib/utils/helpers/migratePasskey');
			const { Preferences } = await import('@capacitor/preferences');
			const { user } = await import('$lib/stores/user.store');
			const userData = { display_name: 'Alice', name: 'Alice Smith' };

			await authState.setupAuthData('token', 'passkey', 'npub1', userData, undefined, true);

			expect(resetMigration).toHaveBeenCalled();
			expect(Preferences.set).toHaveBeenCalledWith({
				key: 'auth_method',
				value: 'passkey'
			});
			expect(user.updateProfile).toHaveBeenCalledWith(userData);
			expect(goto).toHaveBeenCalledWith('/dashboard');
			expect(resolvePath).toHaveBeenCalledWith('/dashboard', {});
		});

		it('when redirect is false should not call goto', async () => {
			const { goto } = await import('$app/navigation');
			await authState.setupAuthData('token', 'passkey', 'npub1', {}, undefined, false);
			expect(goto).not.toHaveBeenCalled();
		});

		it('when biometricData is provided should update appStore with it', async () => {
			const { appStore } = await import('$lib/stores/app.store');
			const biometricData = {
				deviceId: 'dev-1',
				deviceName: 'Phone',
				platform: 'mobile' as const
			};
			await authState.setupAuthData('token', 'passkey', 'npub1', {}, biometricData, false);
			expect(appStore.update).toHaveBeenCalledWith(expect.any(Function));
			const updater = vi.mocked(appStore.update).mock.calls[0][0];
			const state = { biometricData: null };
			updater(state);
			expect(updater({ ...state })).toEqual({ ...state, biometricData });
		});

		it('calls login() only after setup succeeds (when Preferences.set AUTH_METHOD throws, remains unauthenticated)', async () => {
			const { Preferences } = await import('@capacitor/preferences');
			vi.mocked(Preferences.set).mockImplementation(async (opts) => {
				if (opts.key === 'auth_method') throw new Error('storage full');
				return undefined as never;
			});
			await authState
				.setupAuthData('token', 'passkey', 'npub1', {}, undefined, false)
				.catch(() => {});
			expect(get(authState).isAuthenticated).toBe(false);
		});

		it('on setupAuthData failure calls setError, logout, then rethrows', async () => {
			const { setAccessToken, clearPluginTokenCache } = await import(
				'$lib/utils/houdini/plugins/customAuthPlugin'
			);
			vi.mocked(setAccessToken).mockRejectedValueOnce(new Error('plugin failed'));
			let thrown: Error | null = null;
			await authState.setupAuthData('t', 'passkey', 'npub1', {}, undefined, false).catch((e) => {
				thrown = e as Error;
			});
			expect(thrown?.message).toBe('plugin failed');
			expect(get(authState).isAuthenticated).toBe(false);
			expect(clearPluginTokenCache).toHaveBeenCalled();
		});

		it('when redirect is true and goto rejects, setupAuthData does not throw', async () => {
			const { Preferences } = await import('@capacitor/preferences');
			vi.mocked(Preferences.set).mockResolvedValue(undefined);
			const { goto } = await import('$app/navigation');
			vi.mocked(goto).mockRejectedValueOnce(new Error('nav failed'));
			await authState.setupAuthData('token', 'passkey', 'npub1', {}, undefined, true);
			expect(get(authState).isAuthenticated).toBe(true);
		});

		it('releases setup guard after completion so sequential setupAuthData calls both run', async () => {
			const { setAccessToken } = await import('$lib/utils/houdini/plugins/customAuthPlugin');
			vi.mocked(setAccessToken).mockClear();
			await authState.setupAuthData('tokenA', 'passkey', 'npubA', {}, undefined, false);
			await authState.setupAuthData('tokenB', 'passkey', 'npubB', {}, undefined, false);
			expect(setAccessToken).toHaveBeenCalledWith('tokenA');
			expect(setAccessToken).toHaveBeenCalledWith('tokenB');
			expect(setAccessToken).toHaveBeenCalledTimes(2);
		});

		it('when setupAuthData is in progress, second call returns without running setup again', async () => {
			const { user } = await import('$lib/stores/user.store');
			let updateProfileCallCount = 0;
			vi.mocked(user.updateProfile).mockImplementation(() => {
				updateProfileCallCount += 1;
			});
			const { setAccessToken } = await import('$lib/utils/houdini/plugins/customAuthPlugin');
			let resolveBlock: () => void;
			const block = new Promise<void>((r) => {
				resolveBlock = r;
			});
			vi.mocked(setAccessToken).mockImplementation(() => block);
			const p1 = authState.setupAuthData('token1', 'passkey', 'npub1', {}, undefined, false);
			for (let i = 0; i < 10; i++) await Promise.resolve();
			const p2 = authState.setupAuthData('token2', 'passkey', 'npub2', {}, undefined, false);
			expect(updateProfileCallCount).toBe(0);
			resolveBlock!();
			await p1;
			await p2;
			expect(updateProfileCallCount).toBe(1);
		});
	});

	describe('logout guards and resilience', () => {
		it('when logout is in progress, second call returns immediately without running cleanup again', async () => {
			const { clearSession } = await import('$lib/utils/session');
			let resolveDeferred: () => void;
			const deferred = new Promise<void>((r) => {
				resolveDeferred = r;
			});
			vi.mocked(clearSession).mockImplementation(() => deferred as Promise<unknown>);
			const p1 = authState.logout();
			const p2 = authState.logout();
			const { clearPluginTokenCache } = await import('$lib/utils/houdini/plugins/customAuthPlugin');
			expect(clearPluginTokenCache).toHaveBeenCalledTimes(1);
			resolveDeferred!();
			await p1;
			await p2;
		});

		it('when clearPluginTokenCache throws, auth state is still reset in finally', async () => {
			const { clearPluginTokenCache } = await import('$lib/utils/houdini/plugins/customAuthPlugin');
			vi.mocked(clearPluginTokenCache).mockImplementationOnce(() => {
				throw new Error('plugin error');
			});
			authState.set({ isAuthenticated: true, isLoading: false, error: null });
			await expect(authState.logout()).rejects.toThrow('plugin error');
			expect(get(authState).isAuthenticated).toBe(false);
		});

		it('when logout throws (e.g. clearSession rejects), auth state is still reset in finally', async () => {
			const { clearSession } = await import('$lib/utils/session');
			vi.mocked(clearSession).mockRejectedValueOnce(new Error('session failed'));
			authState.set({ isAuthenticated: true, isLoading: false, error: null });
			await authState.logout().catch(() => {});
			expect(get(authState).isAuthenticated).toBe(false);
		});
	});

	describe('setupAuthData preserves original error when logout throws in catch', () => {
		it('rethrows the original setup error when logout() throws during cleanup', async () => {
			const { setAccessToken } = await import('$lib/utils/houdini/plugins/customAuthPlugin');
			const { clearSession } = await import('$lib/utils/session');
			vi.mocked(setAccessToken).mockRejectedValueOnce(new Error('setup failed'));
			vi.mocked(clearSession).mockRejectedValueOnce(new Error('logout failed'));
			let thrown: Error | null = null;
			await authState.setupAuthData('t', 'passkey', 'npub1', {}, undefined, false).catch((e) => {
				thrown = e as Error;
			});
			expect(thrown?.message).toBe('setup failed');
		});
	});

	describe('setupAuthData input validation', () => {
		it('rejects empty accessToken: throws, leaves unauthenticated, does not call setAccessToken', async () => {
			const { setAccessToken } = await import('$lib/utils/houdini/plugins/customAuthPlugin');
			let thrown: Error | null = null;
			await authState.setupAuthData('', 'passkey', 'npub1', {}, undefined, false).catch((e) => {
				thrown = e as Error;
			});
			expect(thrown?.message).toBe('Invalid credentials');
			expect(get(authState).isAuthenticated).toBe(false);
			expect(setAccessToken).not.toHaveBeenCalled();
		});

		it('rejects whitespace-only accessToken: throws, leaves unauthenticated', async () => {
			let thrown: Error | null = null;
			await authState.setupAuthData('   ', 'passkey', 'npub1', {}, undefined, false).catch((e) => {
				thrown = e as Error;
			});
			expect(thrown?.message).toBe('Invalid credentials');
			expect(get(authState).isAuthenticated).toBe(false);
		});

		it('rejects empty npub: throws, leaves unauthenticated, does not call login', async () => {
			let thrown: Error | null = null;
			await authState.setupAuthData('token', 'passkey', '', {}, undefined, false).catch((e) => {
				thrown = e as Error;
			});
			expect(thrown?.message).toBe('Invalid credentials');
			expect(get(authState).isAuthenticated).toBe(false);
		});
	});
});
