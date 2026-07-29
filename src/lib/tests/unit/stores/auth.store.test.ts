import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

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
	});
});
