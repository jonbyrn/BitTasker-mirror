import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { authState } from '$lib/stores/auth.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { get } from 'svelte/store';

export const load: LayoutLoad = async () => {
	// Only check authentication on the client side
	if (browser) {
		const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

		if (!token || token === null) {
			console.log('no token');
			throw redirect(303, '/auth');
		}
		if (get(authState).isAuthenticated === false) {
			throw redirect(303, '/auth');
		}
	}
};

// Disable SSR for protected routes in Capacitor
export const ssr = false;
