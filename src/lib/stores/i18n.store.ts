import { derived, writable } from 'svelte/store';
import translations from '$lib/utils/translations';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

export type Locales = 'en' | 'es';

const DEFAULT_LANGUAGE: Locales = 'en';
const locales = ['en', 'es'];
export const locale = writable<Locales>(DEFAULT_LANGUAGE);

// Load the saved language preference
const loadSavedLanguage = async () => {
	try {
		const { value } = await Preferences.get({ key: StorageKeys.LANGUAGE_PREFERENCE_KEY });
		if (value && locales.includes(value as Locales)) {
			locale.set(value as Locales);
		}
	} catch (error) {
		console.error('Error loading language preference:', error);
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

// Initialize by loading the saved language
loadSavedLanguage();

export const setLocale = async (newLocale: Locales) => {
	if (locales.includes(newLocale)) {
		locale.set(newLocale);
		await saveLanguage(newLocale);
	}
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
