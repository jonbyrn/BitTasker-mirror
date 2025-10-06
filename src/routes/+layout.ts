import { browser } from '$app/environment';
import { setupI18n } from '$lib/i18n/i18n';
import { loadPageTranslations } from '$lib/i18n/routeTranslations';
import { initializeStatusBar } from '$lib/utils/helpers/statusBar';
import type { LayoutLoad } from './$types';

export const prerender = false;
export const ssr = false;
export const csr = true;

export const load: LayoutLoad = async ({ url }) => {
	if (browser) {
		// Only loads essential translations
		await setupI18n();
		// Load route-specific translations for all routes
		await loadPageTranslations(url.pathname);
		
		initializeStatusBar();
	}

	return {};
};