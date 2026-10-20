import { browser } from '$app/environment';
import { setupI18n, loadRouteTranslations } from '$lib/i18n/i18n';

export const ssr = false;

export async function load({ url, fetch }) {
	if (browser) {
		await setupI18n(fetch);
		await loadRouteTranslations(url.pathname, undefined, fetch);
	}
	return {};
}
