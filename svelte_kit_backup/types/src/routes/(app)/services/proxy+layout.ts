// @ts-nocheck
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { Preferences } from '@capacitor/preferences';
import { authState } from '$lib/stores/auth.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { tryCatch } from '$lib/utils/tryCatch';
import { user } from '$lib/stores/user.store';

export const load = async ({ url }: Parameters<LayoutLoad>[0]) => {
	// Only check authentication on the client side
	if (browser) {
		// Use a dynamic import so WebKit does not race the async i18n module initialization.
		void import('$lib/i18n/routeTranslations').then(({ loadPageTranslations }) =>
			loadPageTranslations(url.pathname)
		);

		let token: string | null = null;
		try {
			const result = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
			token = result.value;
		} catch {
			token = null;
		}

		if (token && token !== null) {
			// User is authenticated, initialize user data
			await tryCatch(user.getUserData());
			authState.login();
		}
	}
};

// Disable SSR for public routes in Capacitor
export const ssr = false;
