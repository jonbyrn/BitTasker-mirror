/* eslint-disable @typescript-eslint/no-explicit-any */
import { authTranslations } from './auth';
import { commonTranslation } from './common';
import { companyTranslations } from './company';
import { homePageTranslations } from './home';
import { howItWorksTranslations } from './how_it_works';
import { onboardingTranslations } from './onboarding';
import { recommendationTranslations } from './recomendation';
import { uploaderTranslations } from './uploader';
import { dashboardTranslations } from './dashboard';
import { taskersTranslations } from './taskers';
import { taskeesTranslations } from './taskees';

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
	uploaderTranslations,
	dashboardTranslations,
	recommendationTranslations,
	companyTranslations,
	taskersTranslations,
	taskeesTranslations
);
