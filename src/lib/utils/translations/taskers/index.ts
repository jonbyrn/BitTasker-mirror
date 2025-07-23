/* eslint-disable @typescript-eslint/no-explicit-any */

import { taskersFeeTranslations } from './fee';
import { taskersScrowTranslations } from './scrow';
import { taskersPostTaskTranslations } from './post_task';

function deepMergeTranslations(...sources: any[]) {
	const result: any = {};
	for (const src of sources) {
		for (const lang of Object.keys(src)) {
			result[lang] = { ...(result[lang] || {}), ...src[lang] };
		}
	}
	return result;
}

export const taskersTranslations = deepMergeTranslations(
	taskersFeeTranslations,
	taskersScrowTranslations,
	taskersPostTaskTranslations
);
