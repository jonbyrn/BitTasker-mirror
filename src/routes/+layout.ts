import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { setupI18n } from '$lib/i18n/i18n';
import { loadPageTranslations } from '$lib/i18n/routeTranslations';

export const prerender = true;

export async function load({ url }: { url: URL }) {
	if (url.pathname.startsWith('/dashboard')) {
		const subPath = url.pathname.replace('/dashboard', '');
		redirect(301, '/hiring' + subPath);
	}

	if (browser) {
		await setupI18n();
		await loadPageTranslations(url.pathname);

		try {
			const { getPendingDeepLink, consumeDeepLink } = await import('$lib/utils/deep-link');
			const deepLink = getPendingDeepLink();
			if (deepLink) {
				await consumeDeepLink();
				redirect(303, deepLink);
			}
		} catch (e) {
			if (e && typeof e === 'object' && 'status' in e) throw e;
		}
	} else {
		const { init } = await import('svelte-i18n');

		await init({
			fallbackLocale: 'en',
			initialLocale: 'en',
			loadingDelay: 0
		});
	}
	return {};
}
