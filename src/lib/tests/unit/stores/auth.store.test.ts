import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { authState } from '$lib/stores/auth.store';

const mockDestroySession = vi.fn().mockResolvedValue(undefined);
const mockAuthServiceLogout = vi.fn().mockResolvedValue(undefined);

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

vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		logout: (...args: unknown[]) => mockAuthServiceLogout(...args)
	}
}));

vi.mock('$lib/stores/user.store', () => ({
	user: { reset: vi.fn() }
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

		it('should call destroySession after authService.logout', async () => {
			const callOrder: string[] = [];
			mockAuthServiceLogout.mockImplementation(async () => {
				callOrder.push('server');
			});
			mockDestroySession.mockImplementation(async () => {
				callOrder.push('local');
			});

			await authState.logout();
			expect(callOrder).toEqual(['server', 'local']);
		});
	});
});
