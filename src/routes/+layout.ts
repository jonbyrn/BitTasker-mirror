import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { setupI18n } from '$lib/i18n/i18n';
import { loadPageTranslations } from '$lib/i18n/routeTranslations';
import { initializeStatusBar } from '$lib/utils/helpers/statusBar';
import { redirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

export const prerender = true;
export const ssr = false;
export const csr = true;

export const load: LayoutLoad = async ({ url }) => {
	if (browser) {
		// Only loads essential translations
		await setupI18n();
		// Load route-specific translations for all routes
		await loadPageTranslations(url.pathname);

		initializeStatusBar();

		// Check if the user is logged in
		if (url.pathname === '/') {
			const token = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
			if (token.value) redirect(303, '/tasks');
		}
	}

	return {};
};