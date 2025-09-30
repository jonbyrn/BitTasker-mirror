// @ts-nocheck
// src/routes/+layout.ts  
import { browser } from '$app/environment';
import { setupI18n } from '$lib/i18n/i18n';
import { loadPageTranslations } from '$lib/i18n/routeTranslations';
import { initializeStatusBar } from '$lib/utils/helpers/statusBar';
import type { LayoutLoad } from './$types';

// Para SPA con adaptador estático:
export const ssr = false;        // ✅ Solo client-side
// NO pongas prerender ni csr

export const load = async ({ url }: Parameters<LayoutLoad>[0]) => {
	if (browser) {
		await setupI18n();
		await loadPageTranslations(url.pathname);
		initializeStatusBar();
	}

	return {};
};