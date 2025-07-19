/* eslint-disable @typescript-eslint/no-explicit-any */

import { taskeesGuinelinesTranslations } from './guinelines';
import { taskeesPrinciplesTranslations } from './principles';
import { taskeesFeesTranslations } from './fees';
import { taskeesFaqTranslations } from './faq';

function deepMergeTranslations(...sources: any[]) {
	const result: any = {};
	for (const src of sources) {
		for (const lang of Object.keys(src)) {
			result[lang] = { ...(result[lang] || {}), ...src[lang] };
		}
	}
	return result;
}

export const taskeesTranslations = deepMergeTranslations(
	taskeesGuinelinesTranslations,
	taskeesPrinciplesTranslations,
	taskeesFeesTranslations,
	taskeesFaqTranslations
);
