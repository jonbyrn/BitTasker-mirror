import { describe, expect, it } from 'vitest';
import { chooseLocale } from '$lib/i18n/default-locale';
import { syncDocumentLanguage } from '$lib/i18n/i18n';

describe('document language', () => {
	it('uses Spanish and updates html lang for a fresh El Salvador visitor', () => {
		document.documentElement.lang = 'en';

		const chosen = chooseLocale({
			stored: null,
			navigatorLocale: 'en-SV',
			timeZone: 'America/El_Salvador'
		});

		syncDocumentLanguage(chosen);

		expect(chosen).toBe('es');
		expect(document.documentElement.lang).toBe('es');
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
