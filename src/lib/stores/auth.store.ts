import type { AuthState, Credentials, UserData } from '$lib/types/auth';
import { writable } from 'svelte/store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { goto } from '$app/navigation';
import { appStore } from './app.store';

const initialAuthState: AuthState = {
	isAuthenticated: false,
	isLoading: false,
	error: null
};

const createAuthStore = () => {
	const { subscribe, set, update } = writable<AuthState>(initialAuthState);

	const logout = async () => {
		await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });
		await Preferences.remove({ key: StorageKeys.NPUB });
		await Preferences.remove({ key: StorageKeys.AUTH_METHOD });
		appStore.update((state) => ({ ...state, biometricData: null }));

		// Lazy load user store only when needed
		const { user } = await import('./user.store');
		user.reset();
		set(initialAuthState);
	}

	const setupAuthData = async (accessToken: string, authMethod: string, npub: string, userData: Partial<UserData>, biometricData?: Credentials, redirect: boolean = true) => {
		await Preferences.set({ key: StorageKeys.ACCESS_TOKEN, value: accessToken });
		await Preferences.set({ key: StorageKeys.NPUB, value: npub });

		// Lazy load user store only when needed
		authState.login();

		if (biometricData) appStore.update((state) => ({ ...state, biometricData }));

		if (redirect) await goto('/dashboard/find-tasks').then(async () => {
			// TODO: To be removed after getting auth method from the server
			await Preferences.set({ key: StorageKeys.AUTH_METHOD, value: authMethod });
			const { user } = await import('./user.store');
			if (userData) user.updateProfile(userData);
		});
	}

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
