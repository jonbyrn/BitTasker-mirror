import { describe, expect, it } from 'vitest';
import { chooseLocale } from '$lib/i18n/default-locale';
import { syncDocumentLanguage } from '$lib/i18n/i18n';

describe('document language', () => {
	it('keeps an en-US browser in English even in El Salvador', () => {
		document.documentElement.lang = 'es';

		const chosen = chooseLocale({
			stored: null,
			navigatorLocale: 'en-US',
			country: 'SV',
			timeZone: 'America/El_Salvador'
		});

		syncDocumentLanguage(chosen);

		expect(chosen).toBe('en');
		expect(document.documentElement.lang).toBe('en');
	});

	it('keeps a saved language on the document', () => {
		const chosen = chooseLocale({
			stored: 'en',
			navigatorLocale: 'es-SV',
			country: 'SV',
			timeZone: 'America/El_Salvador'
		});

		syncDocumentLanguage(chosen);

		expect(chosen).toBe('en');
		expect(document.documentElement.lang).toBe('en');
	});
});
