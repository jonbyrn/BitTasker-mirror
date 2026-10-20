import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect, isRedirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { authState } from '$lib/stores/auth.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { readTokenFromPreferenceAndStorage } from '$lib/utils/auth/session-persistence';
import { getPendingDeepLink } from '$lib/utils/deep-link';

export const load: LayoutLoad = async ({ url }) => {
	if (browser) {
		try {
			let preferenceToken: string | null = null;
			try {
				const stored = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
				preferenceToken = stored.value;
			} catch (preferenceError) {
				console.error(preferenceError);
			}
			const token = readTokenFromPreferenceAndStorage(
				preferenceToken,
				typeof localStorage !== 'undefined' ? localStorage : null
			);

			if (!token) {
				// Preserve the target path so we can return after login
				const deepLink = getPendingDeepLink();
				const target = deepLink || url.pathname;
				const loginUrl = '/auth/login';
				const returnTo =
					target !== '/' && target !== '/auth/login' && !target.startsWith('/auth/')
						? `?returnTo=${encodeURIComponent(target)}`
						: '';
				redirect(303, `${loginUrl}${returnTo}`);
			} else {
				await authState.login();
			}
		} catch (error) {
			// Re-throw redirects so SvelteKit can handle them
			if (isRedirect(error)) {
				throw error;
			}
			console.error(error);
		}
	}
};

// Disable SSR for protected routes in Capacitor
export const ssr = false;
