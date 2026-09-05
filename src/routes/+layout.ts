import { browser } from '$app/environment';
import { setupI18n, loadRouteTranslations } from '$lib/i18n/i18n';

export const ssr = false;

export async function load({ url }) {
if (browser) {
await setupI18n();
await loadRouteTranslations(url.pathname);
}
return {};
}
