import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/translation.service', () => ({
	translationService: {
		detectLanguage: vi.fn().mockResolvedValue('en'),
		translate: vi
			.fn()
			.mockResolvedValue({ translatedText: 'translated', originalText: '', targetLanguage: 'es' })
	}
}));

vi.mock('$lib/i18n/i18n', () => ({
	SUPPORTED_LANGUAGES: ['en', 'es']
}));

import { generateLanguageTranslations } from '$lib/nostr/profile/translations';
import { translationService } from '$lib/services/translation.service';

describe('generateLanguageTranslations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('is exported and callable', () => {
		expect(typeof generateLanguageTranslations).toBe('function');
	});

	it('returns undefined when languages array is empty', async () => {
		const result = await generateLanguageTranslations([]);
		expect(result).toBeUndefined();
	});

	it('returns undefined when all languages have empty code', async () => {
		const result = await generateLanguageTranslations([{ code: '', proficiency: 'native' }]);
		expect(result).toBeUndefined();
	});

	it('returns LanguageTranslations with sourceLanguage and translations', async () => {
		vi.mocked(translationService.detectLanguage).mockResolvedValue('en');
		vi.mocked(translationService.translate).mockResolvedValue({
			translatedText: 'nativo',
			originalText: 'native',
			targetLanguage: 'es'
		});

		const result = await generateLanguageTranslations([{ code: 'en', proficiency: 'native' }]);
		expect(result).toBeDefined();
		expect(result?.sourceLanguage).toBe('en');
		expect(result?.translations).toBeDefined();
	});

	it('translates proficiency labels to target languages', async () => {
		vi.mocked(translationService.detectLanguage).mockResolvedValue('en');
		vi.mocked(translationService.translate).mockImplementation(
			async (text: string, targetLang: string) => ({
				translatedText: targetLang === 'es' ? `es_${text}` : text,
				originalText: text,
				targetLanguage: targetLang
			})
		);

		const result = await generateLanguageTranslations([
			{ code: 'en', proficiency: 'native' },
			{ code: 'es', proficiency: 'fluent' }
		]);
		expect(result).toBeDefined();
		expect(result?.translations).toHaveProperty('es');
		expect(result?.translations['es']).toBeDefined();
	});

	it('calls translationService.detectLanguage', async () => {
		vi.mocked(translationService.detectLanguage).mockResolvedValue('en');
		vi.mocked(translationService.translate).mockResolvedValue({
			translatedText: 'nativo',
			originalText: 'native',
			targetLanguage: 'es'
		});

		await generateLanguageTranslations([{ code: 'en', proficiency: 'native' }]);
		expect(translationService.detectLanguage).toHaveBeenCalled();
	});

	it('returns translations when source language covers all supported', async () => {
		vi.mocked(translationService.detectLanguage).mockResolvedValue(null);

		const result = await generateLanguageTranslations([{ code: 'en', proficiency: 'native' }]);
		// Falls back to en, so translations for es should exist
		expect(result).toBeDefined();
		expect(result?.sourceLanguage).toBe('en');
	});

	it('returns undefined on error', async () => {
		vi.mocked(translationService.detectLanguage).mockRejectedValue(new Error('API error'));

		const result = await generateLanguageTranslations([{ code: 'en', proficiency: 'native' }]);
		expect(result).toBeUndefined();
	});
});
