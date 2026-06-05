import type { AuthState, BiometricData, UserData } from '$lib/types/auth';
import { writable } from 'svelte/store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { goto } from '$app/navigation';
import { appStore } from './app.store';
import { resetMigration } from '$lib/utils/helpers/migratePasskey';
import { ndkLogout } from '$lib/nostr/ndk';
import { ndkIdentity } from '$lib/runes/ndkIdentity.svelte';
import { destroySession } from '$lib/utils/session';
import { consumeDeepLink, isValidInternalPath } from '$lib/utils/deep-link';
import { user } from '$lib/stores/user.store';

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

		await ndkLogout();
		ndkIdentity.reset();

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
			// Respect returnTo param and pending deep links before defaulting to /dashboard
			const deepLink = await consumeDeepLink();
			const params = new URLSearchParams(window.location.search);
			const returnTo = params.get('returnTo');
			const target =
				returnTo && isValidInternalPath(returnTo) ? returnTo : deepLink || '/dashboard';
			await goto(target);
			// Close modal and reset migration state
			resetMigration();

			// TODO: To be removed after getting auth method from the server
			await Preferences.set({ key: StorageKeys.AUTH_METHOD, value: authMethod });
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
