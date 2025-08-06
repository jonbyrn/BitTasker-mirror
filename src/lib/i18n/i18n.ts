import { addMessages, init, locale } from 'svelte-i18n';
import { browser } from '$app/environment';

export const SUPPORTED_LANGUAGES = ['en', 'es'];

async function loadMessages() {
	for (const lang of SUPPORTED_LANGUAGES) {
		try {
			const common = await import(`./locales/${lang}/common.json`);
			const auth = await import(`./locales/${lang}/auth.json`);
			const home = await import(`./locales/${lang}/home.json`);
			const how_it_works = await import(`./locales/${lang}/how_it_works.json`);
			const about = await import(`./locales/${lang}/company/about.json`);
			const onboarding = await import(`./locales/${lang}/onboarding.json`);
			const recomendations = await import(`./locales/${lang}/recomendations.json`);
			const careers = await import(`./locales/${lang}/company/careers.json`);
			const press = await import(`./locales/${lang}/company/press.json`);
			const security = await import(`./locales/${lang}/company/security.json`);
			const privacy_policy = await import(`./locales/${lang}/company/privacy_policy.json`);
			const terms = await import(`./locales/${lang}/company/terms.json`);
			const contact = await import(`./locales/${lang}/company/contact.json`);
			const bids = await import(`./locales/${lang}/dashboard/bids.json`);
			const profile = await import(`./locales/${lang}/dashboard/profile/profile.json`); //! pending skills2 - portfolio2
			const guidelines = await import(`./locales/${lang}/taskees/guidelines.json`); 
			const fee = await import(`./locales/${lang}/taskees/fee.json`); 
			const feeTaskers = await import(`./locales/${lang}/taskers/fee.json`); 
			const principles = await import(`./locales/${lang}/taskees/principles.json`); 
			const faq = await import(`./locales/${lang}/taskees/faq.json`); 
			const scrow = await import(`./locales/${lang}/taskers/scrow.json`); 

			addMessages(lang, {
				...common.default,
				...auth.default,
				...home.default,
				...how_it_works.default,
				...about.default,
				...onboarding.default,
				...recomendations.default,
				...careers.default,
				...press.default,
				...security.default,
				...privacy_policy.default,
				...terms.default,
				...contact.default,
				...bids.default,
				...profile.default,
				...guidelines.default,
				...fee.default,
				...principles.default,
				...faq.default,
				...feeTaskers.default,
				...scrow.default,
			});
		} catch (err) {
			console.error(`Error loading messages for ${lang}`, err);
		}
	}
}

const getInitialLocale = (): string => {
	if (browser) {
		const storedLocale = localStorage.getItem('locale');
		if (storedLocale && SUPPORTED_LANGUAGES.includes(storedLocale)) {
			return storedLocale;
		}
		const navigatorLang = navigator.language.split('-')[0];
		if (SUPPORTED_LANGUAGES.includes(navigatorLang)) {
			return navigatorLang;
		}
	}
	return 'en'; // fallback
};

export async function setupI18n() {
	await loadMessages();

	init({
		fallbackLocale: 'en',
		initialLocale: getInitialLocale()
	});

	if (browser) {
		locale.subscribe((value) => {
			if (value) {
				localStorage.setItem('locale', value);
			}
		});
	}
}
