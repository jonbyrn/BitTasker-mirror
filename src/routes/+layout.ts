// src/routes/+layout.ts
import { browser } from '$app/environment';
import { setupI18n } from '$lib/i18n/i18n';
import { initializeStatusBar } from '$lib/utils/helpers/statusBar';

export const prerender = true;
export const ssr = false;
export const csr = true;

export async function load() {
	if (browser) {
		await setupI18n();
		initializeStatusBar();
	}

	return {};
}
