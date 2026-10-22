import enCommon from '../../../static/locales/en/common.json';
import enHow from '../../../static/locales/en/how_it_works.json';
import esCommon from '../../../static/locales/es/common.json';
import esHow from '../../../static/locales/es/how_it_works.json';
import { mergeTranslations, type TranslationBundle } from '$lib/i18n/ssr';

const bundles: Record<'en' | 'es', TranslationBundle> = {
	en: mergeTranslations(enHow, enCommon),
	es: mergeTranslations(esHow, esCommon)
};

function delve(obj: unknown, fullKey: string): string | undefined {
	const keys = fullKey.split('.');
	let result: unknown = obj;
	for (const key of keys) {
		if (!result || typeof result !== 'object') return undefined;
		result = (result as Record<string, unknown>)[key];
	}
	return typeof result === 'string' ? result : undefined;
}

/**
 * How It Works is prerendered before svelte-i18n has a dictionary, so `$t`
 * returns the key. After hydration the fallback locale can also return
 * English while `$locale` is already Spanish. The locale files are the
 * source of truth for this page in both cases.
 */
export function howItWorksText(
	key: string,
	locale: string | null | undefined,
	translated: string
): string {
	const bundle = locale === 'es' ? bundles.es : bundles.en;
	return delve(bundle, key) ?? translated;
}
