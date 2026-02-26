import type { AuthState, BiometricData, UserData } from '$lib/types/auth';
import { writable } from 'svelte/store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { goto } from '$app/navigation';
import { resolve as resolvePath } from '$app/paths';
import { appStore } from './app.store';
import { resetMigration } from '$lib/utils/helpers/migratePasskey';

const initialAuthState: AuthState = {
	isAuthenticated: false,
	isLoading: false,
	error: null
};

const createAuthStore = () => {
	const { subscribe, set, update } = writable<AuthState>(initialAuthState);
	let logoutInProgress = false;
	let setupInProgress = false;

	const logout = async () => {
		if (logoutInProgress) return;
		logoutInProgress = true;
		try {
			const { clearPluginTokenCache } = await import('$lib/utils/houdini/plugins/customAuthPlugin');
			clearPluginTokenCache();

			await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });
			await Preferences.remove({ key: StorageKeys.NPUB });
			await Preferences.remove({ key: StorageKeys.AUTH_METHOD });

			const { clearSession } = await import('$lib/utils/session');
			try {
				await clearSession();
			} catch (cleanupError) {
				console.error('[auth.store] Session cleanup failed during logout:', cleanupError);
			}

			const { user } = await import('./user.store');
			user.reset();
		} finally {
			set(initialAuthState);
			logoutInProgress = false;
		}
	};

	const setupAuthData = async (
		accessToken: string,
		authMethod: string,
		npub: string,
		userData: Partial<UserData>,
		biometricData?: BiometricData,
		redirect: boolean = true
	) => {
		if (setupInProgress) return;
		setupInProgress = true;
		try {
			if (!accessToken?.trim() || !npub?.trim()) {
				const message = 'Invalid credentials';
				update((state) => ({ ...state, error: message, isLoading: false }));
				throw new Error(message);
			}
			const { setAccessToken } = await import('$lib/utils/houdini/plugins/customAuthPlugin');
			await setAccessToken(accessToken);
			await Preferences.set({ key: StorageKeys.NPUB, value: npub });

			if (biometricData) appStore.update((state) => ({ ...state, biometricData }));

			resetMigration();
			await Preferences.set({ key: StorageKeys.AUTH_METHOD, value: authMethod });
			const { user } = await import('./user.store');
			if (userData) user.updateProfile(userData);

			authState.login();

			if (redirect) {
				const loginPath = resolvePath('/dashboard', {} as Record<string, string>);
				goto(loginPath).catch((err: unknown) => {
					console.error('[auth.store] Redirect failed:', err);
					update((state) => ({ ...state, error: 'Navigation failed' }));
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Setup failed';
			update((state) => ({ ...state, error: message, isLoading: false }));
			try {
				await logout();
			} catch (logoutErr) {
				console.error('[auth.store] Logout during setup cleanup failed:', logoutErr);
			}
			throw err instanceof Error ? err : new Error('Setup failed', { cause: err });
		} finally {
			setupInProgress = false;
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
