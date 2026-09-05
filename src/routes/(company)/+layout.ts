import { mergeTranslations } from '$lib/i18n/ssr';
export const prerender = false;
export const ssr = false;

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

	return { translations };
}

