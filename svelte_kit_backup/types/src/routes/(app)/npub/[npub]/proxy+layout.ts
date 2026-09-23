// @ts-nocheck
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { Preferences } from '@capacitor/preferences';
import { authState } from '$lib/stores/auth.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { tryCatch } from '$lib/utils/tryCatch';
import { user } from '$lib/stores/user.store';

export const load = async () => {
	// Only check authentication on the client side
	if (browser) {
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

// Disable prerendering for dynamic routes (not compatible with Capacitor)
export const prerender = false;


;null as any as LayoutLoad;