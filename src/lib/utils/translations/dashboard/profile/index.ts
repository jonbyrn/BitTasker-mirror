/* eslint-disable @typescript-eslint/no-explicit-any */

import { availabilityTranslations } from './availability';
import { personalTranslations } from './personal';
import { profileTranslation } from './profile';

function deepMergeTranslations(...sources: any[]) {
	const result: any = {};
	for (const src of sources) {
		for (const lang of Object.keys(src)) {
			result[lang] = { ...(result[lang] || {}), ...src[lang] };
		}
	}
	return result;
}

export const profileTranslations = deepMergeTranslations(
	profileTranslation,
	availabilityTranslations,
	personalTranslations
);
