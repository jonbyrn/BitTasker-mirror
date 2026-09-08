import { mergeTranslations } from '$lib/i18n/ssr';
import { addMessages, init } from 'svelte-i18n';
export const prerender = false;
export const ssr = true;

void init({ fallbackLocale: 'en', initialLocale: 'en', loadingDelay: 0 });

export async function load({ fetch }) {
	const [homeResponse, commonResponse] = await Promise.all([
		fetch('/locales/en/home.json'),
		fetch('/locales/en/common.json')
	]);

	if (!homeResponse.ok || !commonResponse.ok) {
		console.warn('[company/+layout] Failed to load translations');
		return { translations: {} };
	}

	const [homeTranslations, commonTranslations] = await Promise.all([
		homeResponse.json(),
		commonResponse.json()
	]);

	const translations = mergeTranslations(homeTranslations, commonTranslations);
	addMessages('en', translations);
	await init({ fallbackLocale: 'en', initialLocale: 'en', loadingDelay: 0 });

	return { translations };
}

