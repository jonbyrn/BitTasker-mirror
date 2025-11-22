import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authState } from '$lib/stores/auth.store';
import { resetAuthSingleton } from '$lib/utils/nostr-message';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { appStore } from '$lib/stores/app.store';

// Mock dependencies
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn()
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		get: vi.fn(),
		update: vi.fn()
	}
}));

vi.mock('$lib/stores/user.store', () => ({
	user: {
		reset: vi.fn()
	}
}));

vi.mock('$lib/utils/nostr-message', () => ({
	resetAuthSingleton: vi.fn()
}));

describe('Logout Cleanup', () => {
	const mockPreferencesRemove = vi.mocked(Preferences.remove);
	const mockAppStoreUpdate = vi.mocked(appStore.update);
	const mockResetAuthSingleton = vi.mocked(resetAuthSingleton);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should reset authSingleton when logout() is called', async () => {
		await authState.logout();

		expect(mockResetAuthSingleton).toHaveBeenCalled();
	});

	it('should clear appStore.biometricData on logout', async () => {
		await authState.logout();

		expect(mockAppStoreUpdate).toHaveBeenCalledWith(
			expect.any(Function)
		);

		// Verify the update function clears biometricData
		const updateCall = mockAppStoreUpdate.mock.calls[0][0];
		const state = { biometricData: { username: 'test', password: 'test' } };
		const newState = updateCall(state);
		expect(newState.biometricData).toBeNull();
	});

	it('should remove ACCESS_TOKEN, NPUB, and AUTH_METHOD from Preferences', async () => {
		await authState.logout();

		expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: StorageKeys.ACCESS_TOKEN });
		expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: StorageKeys.NPUB });
		expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: StorageKeys.AUTH_METHOD });
		expect(mockPreferencesRemove).toHaveBeenCalledTimes(3);
	});

	it('should reset user store on logout', async () => {
		const { user } = await import('$lib/stores/user.store');
		const mockUserReset = vi.mocked(user.reset);

		await authState.logout();

		expect(mockUserReset).toHaveBeenCalled();
	});

	it('should perform cleanup in correct order', async () => {
		const callOrder: string[] = [];

		mockPreferencesRemove.mockImplementation(async ({ key }) => {
			callOrder.push(`remove-${key}`);
		});

		mockAppStoreUpdate.mockImplementation((fn) => {
			callOrder.push('update-appStore');
			fn({ biometricData: null });
		});

		mockResetAuthSingleton.mockImplementation(() => {
			callOrder.push('reset-authSingleton');
		});

		await authState.logout();

		// Verify order: Preferences first, then appStore, then singleton
		expect(callOrder[0]).toContain('remove-');
		expect(callOrder[callOrder.length - 2]).toBe('update-appStore');
		expect(callOrder[callOrder.length - 1]).toBe('reset-authSingleton');
	});

	it('should handle multiple logout calls gracefully', async () => {
		await authState.logout();
		await authState.logout();
		await authState.logout();

		// Should not throw errors
		expect(mockPreferencesRemove).toHaveBeenCalledTimes(9); // 3 calls × 3 keys
		expect(mockResetAuthSingleton).toHaveBeenCalledTimes(3);
	});
});

