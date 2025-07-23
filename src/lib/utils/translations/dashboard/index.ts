/* eslint-disable @typescript-eslint/no-explicit-any */

import { dashboardPageTranslations } from './dashboard';

function deepMergeTranslations(...sources: any[]) {
	const result: any = {};
	for (const src of sources) {
		for (const lang of Object.keys(src)) {
			result[lang] = { ...(result[lang] || {}), ...src[lang] };
		}
	}
	return result;
}

export const dashboardTranslations = deepMergeTranslations(dashboardPageTranslations);
