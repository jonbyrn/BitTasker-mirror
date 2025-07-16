/* eslint-disable @typescript-eslint/no-explicit-any */
import { aboutTranslations } from './about';

function deepMergeTranslations(...sources: any[]) {
	const result: any = {};
	for (const src of sources) {
		for (const lang of Object.keys(src)) {
			result[lang] = { ...(result[lang] || {}), ...src[lang] };
		}
	}
	return result;
}

export const companyTranslations = deepMergeTranslations(
	aboutTranslations
	// careersTranslations,
	// faqTranslations,
);
