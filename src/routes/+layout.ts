import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { setupI18n } from '$lib/i18n/i18n';
import { loadPageTranslations } from '$lib/i18n/routeTranslations';
import { initializeStatusBar } from '$lib/utils/helpers/statusBar';
import { initializeSplashScreen } from '$lib/utils/helpers/splashScreen';
import { initDebug } from '$lib/utils/debug';

export const prerender = true;
export const ssr = false;
export const csr = true;

// Initialize debug tools early
initDebug();

export const load: LayoutLoad = async ({ url }) => {
	if (browser) {
		await initializeSplashScreen();
		await setupI18n();
		await loadPageTranslations(url.pathname);
		await initializeStatusBar();
	}

	return {};
};
