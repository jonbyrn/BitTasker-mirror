/* eslint-disable @typescript-eslint/no-explicit-any */
import { aboutTranslations } from './about';
import { careersTranslations } from './careers';
import { pressTranslations } from './press';
import { securityTranslations } from './security';

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
	aboutTranslations,
	securityTranslations,
	careersTranslations,
	pressTranslations
);
