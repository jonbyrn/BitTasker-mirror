/* eslint-disable @typescript-eslint/no-explicit-any */

import { dashboardPageTranslations } from './dashboard';
import { bidTranslations } from './bid';
import { settingsTranslations } from './settings';
import { taskTranslations } from './task';
import { profileTranslations } from './profile';

function deepMergeTranslations(...sources: any[]) {
	const result: any = {};
	for (const src of sources) {
		for (const lang of Object.keys(src)) {
			result[lang] = { ...(result[lang] || {}), ...src[lang] };
		}
	}
	return result;
}

export const dashboardTranslations = deepMergeTranslations(
	dashboardPageTranslations,
	profileTranslations,
	bidTranslations,
	settingsTranslations,
	taskTranslations
);
