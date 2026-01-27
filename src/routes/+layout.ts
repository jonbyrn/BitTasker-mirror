import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { setupI18n } from '$lib/i18n/i18n';
import { loadPageTranslations } from '$lib/i18n/routeTranslations';
import { initializeStatusBar } from '$lib/utils/helpers/statusBar';
import { initializeSplashScreen } from '$lib/utils/helpers/splashScreen';
import { redirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

export const prerender = true;
export const ssr = false;
export const csr = true;

export const load: LayoutLoad = async ({ url }) => {
	if (browser) {
		await initializeSplashScreen();
		await setupI18n();
		await loadPageTranslations(url.pathname);
		await initializeStatusBar();
	}

	return {};
};