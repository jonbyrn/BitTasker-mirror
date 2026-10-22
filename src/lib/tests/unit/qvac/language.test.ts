import { describe, expect, it } from 'vitest';
import { detectLanguage, shouldOfferTranslation, uiLanguage } from '$lib/qvac/language';

describe('qvac source language', () => {
	it('treats "a pie" as Spanish and does not count "a" as English', () => {
		expect(detectLanguage('a pie')).toBe('es');
		expect(shouldOfferTranslation('a pie', 'es')).toBe(false);
		expect(shouldOfferTranslation('a pie', 'en')).toBe(true);
	});

	it('hides translation when the source already matches the UI language', () => {
		expect(shouldOfferTranslation('Limpiar la cocina.', 'es')).toBe(false);
		expect(shouldOfferTranslation('Resumen', 'es')).toBe(false);
		expect(shouldOfferTranslation('Clean the kitchen.', 'en')).toBe(false);
		expect(shouldOfferTranslation('Summary', 'en')).toBe(false);
	});

	it('offers a translation into the UI language when the source differs', () => {
		expect(uiLanguage('es-SV')).toBe('es');
		expect(uiLanguage('en')).toBe('en');
		expect(shouldOfferTranslation('Clean the kitchen.', 'es')).toBe(true);
		expect(shouldOfferTranslation('Limpiar la cocina.', 'en')).toBe(true);
		expect(shouldOfferTranslation('Reparar una puerta', 'en')).toBe(true);
	});
});
