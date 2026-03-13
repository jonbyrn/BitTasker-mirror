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
		reset: vi.fn()
	}
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
			expect(keysRemoved).toContain('e2eBiometricData');
		});
	});
});
