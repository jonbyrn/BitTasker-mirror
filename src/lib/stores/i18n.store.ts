import { derived, writable } from 'svelte/store';
import translations from '$lib/utils/translations';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

export type Locales = 'en' | 'es';

// Single source of truth for all language information
export const LANGUAGES: Array<{
	code: Locales;
	name: string;
	flag: string;
}> = [
	{ code: 'en', name: 'English', flag: '🇺🇸' },
	{ code: 'es', name: 'Español', flag: '🇪🇸' }
];

// Derived values from the main LANGUAGES array
const SUPPORTED_LOCALES = LANGUAGES.map(lang => lang.code);
const LANGUAGE_FLAGS = LANGUAGES.reduce((acc, lang) => {
	acc[lang.code] = lang.flag;
	return acc;
}, {} as Record<Locales, string>);

const DEFAULT_LANGUAGE: Locales = 'en';

// Function to detect user's browser language
const detectBrowserLanguage = (): Locales => {
	if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
	
	// Get the user's preferred languages from the browser
	const browserLanguages = navigator.languages || [navigator.language];
	
	// Check each browser language preference
	for (const lang of browserLanguages) {
		// Extract the language code (e.g., 'en-US' -> 'en')
		const langCode = lang?.split('-')[0]?.toLowerCase();
		
		// Check if we support this language
		if (SUPPORTED_LOCALES.includes(langCode as Locales)) {
			return langCode as Locales;
		}
	}
	
	// Fallback to default language if no supported language found
	return DEFAULT_LANGUAGE;
};

export const locale = writable<Locales>(DEFAULT_LANGUAGE);

// Load the saved language preference or detect browser language
const loadSavedLanguage = async () => {
	try {
		const { value } = await Preferences.get({ key: StorageKeys.LANGUAGE_PREFERENCE_KEY });
		
		if (value && SUPPORTED_LOCALES.includes(value as Locales)) {
			// Use saved preference if available
			locale.set(value as Locales);
		} else {
			// Detect browser language if no saved preference
			const browserLang = detectBrowserLanguage();
			locale.set(browserLang);
			
			// Save the detected language as preference
			await saveLanguage(browserLang);
		}
	} catch (error) {
		console.error('Error loading language preference:', error);
		// Fallback to browser detection or default
		const browserLang = detectBrowserLanguage();
		locale.set(browserLang);
	}
};

// Save the language preference
const saveLanguage = async (language: Locales) => {
	try {
		await Preferences.set({
			key: StorageKeys.LANGUAGE_PREFERENCE_KEY,
			value: language
		});
	} catch (error) {
		console.error('Error saving language preference:', error);
	}
};

// Initialize by loading the saved language or detecting browser language
loadSavedLanguage();

export const setLocale = async (newLocale: Locales) => {
	if (SUPPORTED_LOCALES.includes(newLocale)) {
		locale.set(newLocale);
		await saveLanguage(newLocale);
	}
};

// Helper function to get flag icon for current locale
export const getCurrentLanguageFlag = (currentLocale: Locales): string => {
	return LANGUAGE_FLAGS[currentLocale] || LANGUAGE_FLAGS[DEFAULT_LANGUAGE];
};

// Helper function to get language name
export const getLanguageName = (code: Locales): string => {
	const language = LANGUAGES.find(lang => lang.code === code);
	return language?.name || LANGUAGES.find(lang => lang.code === DEFAULT_LANGUAGE)?.name || 'English';
};

// Helper function to get complete language info
export const getLanguageInfo = (code: Locales) => {
	return LANGUAGES.find(lang => lang.code === code) || LANGUAGES.find(lang => lang.code === DEFAULT_LANGUAGE);
};

const translate = (
	locale: Locales,
	key: keyof (typeof translations)['en'], // Use 'en' as the source of truth for keys
	variables: Map<string, unknown>
) => {
	try {
		// Use 'as any' to bypass type checking for other locales, assuming they have the same keys.
		let text = (translations[locale] as any)[key];

		if (!text || typeof text !== 'string') {
			// Fallback to English if translation is missing
			text = translations['en'][key];
			if (!text || typeof text !== 'string') {
				throw new Error(`Translation not found for key: ${key}`);
			}
		}

		Array.from(variables.entries()).forEach(([k, v]) => {
			const regex = new RegExp(`{{${k}}}`, 'g');
			text = text.replace(regex, String(v));
		});

		return text;
	} catch (e) {
		throw new Error('error translating ' + e);
	}
};

export const t = derived(
	locale,
	($locale) =>
		(
			key: keyof (typeof translations)['en'], // Use 'en' as the source of truth for keys
			variables: Map<string, unknown> = new Map()
		) =>
			translate($locale, key, variables)
);
