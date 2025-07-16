/* eslint-disable @typescript-eslint/no-explicit-any */
import { authTranslations } from './auth';
import { commonTranslation } from './common';
import { companyTranslations } from './company';
import { bidTranslations } from './dashboard/bid';
import { dashboardTranslations } from './dashboard/dashboard';
import { taskTranslations } from './dashboard/task';
import { homePageTranslations } from './home';
import { howItWorksTranslations } from './how_it_works';
import { onboardingTranslations } from './onboarding';
import { profileTranslations } from './profile';
import { recommendationTranslations } from './recomendation';
import { uploaderTranslations } from './uploader';

function deepMergeTranslations(...sources: any[]) {
	const result: any = {};
	for (const src of sources) {
		for (const lang of Object.keys(src)) {
			result[lang] = { ...(result[lang] || {}), ...src[lang] };
		}
	}
	return result;
}

export default deepMergeTranslations(
	authTranslations,
	commonTranslation,
	homePageTranslations,
	howItWorksTranslations,
	onboardingTranslations,
	profileTranslations,
	uploaderTranslations,
	bidTranslations,
	taskTranslations,
	dashboardTranslations,
	recommendationTranslations,
	companyTranslations
);
