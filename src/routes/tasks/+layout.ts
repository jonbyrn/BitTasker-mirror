import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { Preferences } from '@capacitor/preferences';
import { authState } from '$lib/stores/auth.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { tryCatch } from '$lib/utils/tryCatch';
import { user } from '$lib/stores/user.store';
import { loadPageTranslations } from '$lib/i18n/routeTranslations';

export const load: LayoutLoad = async ({ url }) => {
	// Only check authentication on the client side
	if (browser) {
		// Load route-specific translations
		await loadPageTranslations(url.pathname);

		const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

		if (token && token !== null) {
			// User is authenticated, initialize user data
			await tryCatch(user.getUserData());
			authState.login();
		}
	}
};

// Disable SSR for public routes in Capacitor
export const ssr = false;
