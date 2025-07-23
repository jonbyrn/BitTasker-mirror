/* eslint-disable @typescript-eslint/no-explicit-any */
import { derived, writable } from 'svelte/store';
import translations from '$lib/utils/translations/';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

export type Locales = 'en' | 'es';

// Single source of truth for all language information
export const LANGUAGES: Array<{
	code: Locales;
	name: string;
	flag: string;
}> = [
	{ code: 'en', name: 'English', flag: 'flag:us-4x3' },
	{ code: 'es', name: 'Español', flag: 'flag:es-4x3' }
];

// Derived values from the main LANGUAGES array
const SUPPORTED_LOCALES = LANGUAGES.map(lang => lang.code);
const LANGUAGE_FLAGS = LANGUAGES.reduce((acc, lang) => {
	acc[lang.code] = lang.flag;
	return acc;
}, {} as Record<Locales, string>);

const DEFAULT_LANGUAGE: Locales = 'en';

// Synchronous locale detection using localStorage and navigator.language
function getInitialLocale(): Locales {
	// Try localStorage first
	if (typeof localStorage !== 'undefined') {
		const saved = localStorage.getItem('language');
		if (saved && SUPPORTED_LOCALES.includes(saved as Locales)) {
			return saved as Locales;
		}
	}
	// Fallback to browser language
	if (typeof navigator !== 'undefined') {
		const browserLanguages = navigator.languages || [navigator.language];
		for (const lang of browserLanguages) {
			const langCode = lang?.split('-')[0]?.toLowerCase();
			if (SUPPORTED_LOCALES.includes(langCode as Locales)) {
				return langCode as Locales;
			}
		}
	}
	// Default
	return DEFAULT_LANGUAGE;
}

export const locale = writable<Locales>(getInitialLocale());

// Save the language preference to localStorage and Capacitor Preferences (async, after render)
const saveLanguage = (language: Locales) => {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('language', language);
	}
	// Save to Capacitor Preferences in the background
	setTimeout(() => {
		Preferences.set({
			key: StorageKeys.LANGUAGE_PREFERENCE_KEY,
			value: language
		});
	}, 0);
};

export const setLocale = (newLocale: Locales) => {
	if (SUPPORTED_LOCALES.includes(newLocale)) {
		locale.set(newLocale);
		saveLanguage(newLocale);
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
				throw new Error(`Translation not found for key: ${String(key)}`);
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
