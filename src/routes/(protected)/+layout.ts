import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect, isRedirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { authState } from '$lib/stores/auth.store';
import { setAccessToken } from '$lib/utils/houdini/plugins/customAuthPlugin';
import { StorageKeys } from '$lib/utils/constants/storage';

export const load: LayoutLoad = async () => {
	if (browser) {
		try {
			const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

			if (!token || token === null) {
				redirect(303, '/auth/login');
			} else {
				try {
					await setAccessToken(token);
					await authState.login();
				} catch (syncError) {
					console.error('[protected layout] Failed to sync token to plugin:', syncError);
					redirect(303, '/auth/login');
				}
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
