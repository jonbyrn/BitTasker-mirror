// src/routes/+layout.ts
import { browser } from '$app/environment';
import { setupI18n } from '$lib/i18n/i18n';
import { loadPageTranslations } from '$lib/i18n/routeTranslations';
import { initializeStatusBar } from '$lib/utils/helpers/statusBar';
import { setupServiceWorker } from '$lib/utils/serviceWorkerIntegration';
import type { LayoutLoad } from './$types';

export const prerender = true;
export const ssr = false;
export const csr = true;

export const load: LayoutLoad = async ({ url }) => {
	if (browser) {
		// Fast, optimized i18n setup - only loads essential translations
		await setupI18n();
		
		// Load route-specific translations for all routes
		await loadPageTranslations(url.pathname);
		
		initializeStatusBar();
		
		// Initialize service worker functionality
		await setupServiceWorker();
	}

	return {};
};
