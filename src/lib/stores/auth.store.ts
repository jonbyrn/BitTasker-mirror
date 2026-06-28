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
import {
	clearPersistedE2EBiometricData,
	persistE2EBiometricData
} from '$lib/utils/helpers/e2eBiometricState';

const initialAuthState: AuthState = {
	isAuthenticated: false,
	isLoading: false,
	error: null
};

async function initNotifications() {
	const { notificationCenterStore } = await import('$lib/stores/notificationCenter.store');
	await notificationCenterStore.fetchUnreadCount();

	const { connectNotificationSocket } = await import(
		'$lib/api/services/notificationSocket.service'
	);
	await connectNotificationSocket();
}

const createAuthStore = () => {
	const { subscribe, set, update } = writable<AuthState>(initialAuthState);

	const logout = async () => {
		const { default: authService } = await import('$lib/api/services/auth.service');
		// Revoke refresh token on the backend (best-effort)
		await authService.logout();

		// Disconnect notification WebSocket before clearing auth state
		const { disconnectNotificationSocket } = await import(
			'$lib/api/services/notificationSocket.service'
		);
		disconnectNotificationSocket();

		await ndkLogout();
		ndkIdentity.reset();

		// Dismiss any open banners
		appStore.update((state) => ({
			...state,
			toasts: state.toasts.filter((t) => t.type !== 'banner')
		}));

		// Destroy the local session (tokens, stores, caches)
		await destroySession();
		await clearPersistedE2EBiometricData();

		// Reset auth state
		set(initialAuthState);

		// Navigate to home after clearing auth. Must happen after destroySession()
		// and set() so the user is no longer authenticated — otherwise the
		// protected layout guard would redirect to /hiring instead of /.
		await goto('/', { replaceState: true });
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

		// Initialize notification count and WebSocket after login.
		// The layout's onMount handles first load, but on re-login the layout
		// doesn't remount, so we must explicitly re-init here.
		initNotifications().catch(() => {
			// Non-critical — layout will also attempt this on mount
		});

		if (biometricData) {
			appStore.update((state) => ({ ...state, biometricData }));
			await persistE2EBiometricData(biometricData);
		}

		if (redirect) {
			// Respect returnTo param and pending deep links before defaulting to /hiring
			const deepLink = await consumeDeepLink();
			const params = new URLSearchParams(window.location.search);
			const returnTo = params.get('returnTo');
			const target = returnTo && isValidInternalPath(returnTo) ? returnTo : deepLink || '/hiring';
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
