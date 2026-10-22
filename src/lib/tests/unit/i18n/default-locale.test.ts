import { describe, expect, it } from 'vitest';
import { chooseLocale } from '$lib/i18n/default-locale';

describe('chooseLocale', () => {
	it('keeps a saved language', () => {
		expect(
			chooseLocale({
				stored: 'en',
				navigatorLocale: 'es-SV',
				country: 'SV',
				timeZone: 'America/El_Salvador'
			})
		).toBe('en');
	});

	it('uses Spanish only for an es browser language or a saved choice', () => {
		expect(chooseLocale({ navigatorLocale: 'es-SV' })).toBe('es');
		expect(chooseLocale({ navigatorLocale: 'es' })).toBe('es');
		expect(
			chooseLocale({
				stored: 'es',
				navigatorLocale: 'en-US',
				country: 'SV',
				timeZone: 'America/El_Salvador'
			})
		).toBe('es');
		expect(chooseLocale({ navigatorLocale: 'en-SV' })).toBe('en');
		expect(chooseLocale({ navigatorLocale: 'en-US', country: 'SV' })).toBe('en');
		expect(chooseLocale({ navigatorLocale: 'en-US', timeZone: 'America/El_Salvador' })).toBe('en');
	});

	it('does not treat Swedish as El Salvador', () => {
		expect(chooseLocale({ navigatorLocale: 'sv-SE' })).toBe('en');
		expect(chooseLocale({ navigatorLocale: 'sv' })).toBe('en');
	});

	it('uses English when the browser language has no complete interface', () => {
		expect(chooseLocale({ navigatorLocale: 'fr-FR', timeZone: 'Europe/Paris' })).toBe('en');
		expect(chooseLocale({ stored: 'pt', navigatorLocale: 'pt-BR' })).toBe('en');
		expect(chooseLocale({ navigatorLocale: 'en-US', timeZone: 'America/New_York' })).toBe('en');
	});
});
