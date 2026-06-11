import { mergeTranslations } from '$lib/i18n/ssr';
import homeTranslations from '../../../static/locales/en/home.json';
import commonTranslations from '../../../static/locales/en/common.json';

export const prerender = true;
export const ssr = true;

const translations = mergeTranslations(homeTranslations, commonTranslations);

export function load() {
	return { translations };
}
