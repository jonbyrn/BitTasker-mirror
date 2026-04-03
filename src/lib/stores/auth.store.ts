import type { AuthState, BiometricData, UserData } from '$lib/types/auth';
import { writable } from 'svelte/store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { goto } from '$app/navigation';
import { appStore } from './app.store';
import { resetMigration } from '$lib/utils/helpers/migratePasskey';
import { destroySession } from '$lib/utils/session';

const initialAuthState: AuthState = {
	isAuthenticated: false,
	isLoading: false,
	error: null
};

const createAuthStore = () => {
	const { subscribe, set, update } = writable<AuthState>(initialAuthState);

	const logout = async () => {
		const { default: authService } = await import('$lib/api/services/auth.service');
		// Revoke refresh token on the backend (best-effort)
		await authService.logout();

		// Destroy the local session (tokens, stores, caches)
		await destroySession();

		// Reset auth state
		set(initialAuthState);
	};

	const setupAuthData = async (
		accessToken: string,
		authMethod: string,
		npub: string,
		userData: Partial<UserData>,
		biometricData?: BiometricData,
		redirect: boolean = true,
		refreshToken?: string
	) => {
		await Preferences.set({ key: StorageKeys.ACCESS_TOKEN, value: accessToken });
		await Preferences.set({ key: StorageKeys.NPUB, value: npub });
		if (refreshToken) {
			await Preferences.set({ key: StorageKeys.REFRESH_TOKEN, value: refreshToken });
		}
		if (biometricData) {
			await Preferences.set({
				key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID,
				value: biometricData.credentialId
			});
		}

		// Lazy load user store only when needed
		authState.login();

		if (biometricData) appStore.update((state) => ({ ...state, biometricData }));

		if (redirect) {
			await goto('/dashboard');
			// Close modal and reset migration state
			resetMigration();

			// TODO: To be removed after getting auth method from the server
			await Preferences.set({ key: StorageKeys.AUTH_METHOD, value: authMethod });
			const { user } = await import('./user.store');
			if (userData) user.updateProfile(userData);
		}
	};

	return {
		subscribe,
		set,
		setLoading: (loading: boolean) => update((state) => ({ ...state, isLoading: loading })),
		setError: (error: string | null) => update((state) => ({ ...state, error })),
		login: async () => {
			update((state) => ({ ...state, isAuthenticated: true, error: null }));
		},
		logout,
		setupAuthData
	};
};

export const authState = createAuthStore();
export const isCaptchaVerified = writable(false);
