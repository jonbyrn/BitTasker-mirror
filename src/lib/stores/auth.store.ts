import type { AuthState, BiometricData, UserData } from '$lib/types/auth';
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { consumeDeepLink, isValidInternalPath } from '$lib/utils/deep-link';

export const isCaptchaVerified = writable(false);

const initialAuthState: AuthState = {
	isAuthenticated: false,
	isLoading: true,
	error: null
};

function getCachedUserProfile(): Partial<UserData> | null {
	if (!browser) return null;

	try {
		const cached = localStorage.getItem(StorageKeys.USER_PROFILE);
		if (!cached) return null;

		const parsed: unknown = JSON.parse(cached);
		return parsed !== null && typeof parsed === 'object' ? (parsed as Partial<UserData>) : null;
	} catch {
		return null;
	}
}

function cacheUserProfile(userData: Partial<UserData>): void {
	if (!browser) return;

	try {
		localStorage.setItem(StorageKeys.USER_PROFILE, JSON.stringify(userData));
	} catch {
		// Profile caching is best-effort and must not block authentication.
	}
}

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

	// Capacitor Preferences is asynchronous, so hydrate after creating the
	// writable and update this exact store instance before the layout renders.
	if (browser) {
		void Preferences.get({ key: StorageKeys.ACCESS_TOKEN })
			.then(async ({ value: storedToken }) => {
				// A stored access token is the account session. Do not delete it when the
				// npub is missing: that signed the user out on refresh, and the auth
				// layout then sent /auth/onboarding back to /auth/signup.
				const signedIn = Boolean(storedToken && storedToken.trim());
				update((state) => ({
					...state,
					isAuthenticated: signedIn,
					isLoading: false
				}));

				if (signedIn) {
					const cachedProfile = getCachedUserProfile();
					if (cachedProfile) {
						const { user } = await import('$lib/stores/user.store');
						user.updateProfile(cachedProfile);
					}
				}
			})
			.catch(() => {
				update((state) => ({ ...state, isLoading: false }));
			});
	}

	const logout = async () => {
		const { default: authService } = await import('$lib/api/services/auth.service');
		// Revoke refresh token on the backend (best-effort)
		await authService.logout();

		// Disconnect notification WebSocket before clearing auth state
		const { disconnectNotificationSocket } = await import(
			'$lib/api/services/notificationSocket.service'
		);
		disconnectNotificationSocket();

		const { ndkLogout } = await import('$lib/nostr/ndk');
		await ndkLogout();

		// Reset the cached NDK identity after logout so a new login starts fresh
		const { ndkIdentity } = await import('$lib/runes/ndkIdentity.svelte');
		ndkIdentity.reset();

		// Dismiss any open banners
		const { appStore } = await import('./app.store');
		appStore.update((state) => ({
			...state,
			toasts: state.toasts.filter((t) => t.type !== 'banner')
		}));

		// Destroy the local session (tokens, stores, caches)
		const { destroySession } = await import('$lib/utils/session');
		await destroySession();
		const { clearPersistedE2EBiometricData } = await import('$lib/utils/helpers/e2eBiometricState');
		await clearPersistedE2EBiometricData();

		// Reset auth state
		set({ ...initialAuthState, isAuthenticated: false, isLoading: false });
		if (browser) localStorage.removeItem(StorageKeys.USER_PROFILE);

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
			const { appStore } = await import('./app.store');
			appStore.update((state) => ({ ...state, biometricData }));
			const { persistE2EBiometricData } = await import('$lib/utils/helpers/e2eBiometricState');
			await persistE2EBiometricData(biometricData);
		}

		// nsec login does not redirect through this function. The stored method is still
		// recorded, and the wallet unlock that follows is always the passkey.
		await Preferences.set({ key: StorageKeys.AUTH_METHOD, value: authMethod });
		const { rememberWalletLogin } = await import('$lib/utils/helpers/login-method');
		rememberWalletLogin(authMethod);

		if (redirect) {
			// Respect returnTo param and pending deep links before defaulting to /hiring.
			const deepLink = await consumeDeepLink();
			const params = new URLSearchParams(window.location.search);
			const returnTo = params.get('returnTo');
			const target =
				returnTo && isValidInternalPath(returnTo) ? returnTo : deepLink || resolve('/hiring');
			await goto(target);
			// Close modal and reset migration state
			const { resetMigration } = await import('$lib/utils/helpers/migratePasskey');
			resetMigration();

			if (userData) {
				const { user } = await import('$lib/stores/user.store');
				user.updateProfile(userData);
			}
		}
	};

	return {
		subscribe,
		set,
		setLoading: (loading: boolean) => update((state) => ({ ...state, isLoading: loading })),
		setError: (error: string | null) => update((state) => ({ ...state, error })),
		login: async (userData?: Partial<UserData>) => {
			update((state) => ({
				...state,
				isAuthenticated: true,
				isLoading: false,
				error: null
			}));
			if (userData) {
				const { user } = await import('$lib/stores/user.store');
				user.updateProfile(userData);
				cacheUserProfile(userData);
			}
		},
		logout,
		setupAuthData
	};
};

export const authState = createAuthStore();
