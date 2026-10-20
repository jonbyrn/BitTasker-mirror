/**
 * Translation service that proxies requests through the backend API.
 * The backend holds the Google Translate API key — never the client.
 * Only supports English and Spanish translation.
 */

import type { AxiosRequestConfig } from 'axios';
import { BaseApiService } from '$lib/api/apiService';
import { ENDPOINTS } from '$lib/api/endpoints';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

export interface TranslationResult {
	translatedText: string;
	detectedSourceLanguage?: string;
	originalText: string;
	targetLanguage: string;
}

export interface TranslationError {
	code: string;
	message: string;
	details?: unknown;
}

interface CachedTranslation {
	result: TranslationResult;
	timestamp: number;
}

interface BackendTranslateResponse {
	translations: string[];
}

export class TranslationService extends BaseApiService {
	private cache = new Map<string, CachedTranslation>();
	private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
	private readonly RATE_LIMIT_DELAY = 500; // 500ms between calls
	private lastApiCall = 0;
	private pendingTranslations = new Set<string>();
	private readonly SUPPORTED_LANGUAGES = ['en', 'es'] as const;
	private cacheLoaded = false;

	constructor() {
		super();
		this.loadCacheFromStorage();
	}

	/**
	 * Returns true if the translation service is configured and ready to use.
	 */
	isAvailable(): boolean {
		// The service is available if the app is initialized.
		// Actual API availability depends on the backend.
		return true;
	}

	private validateLanguage(language: string): boolean {
		return this.SUPPORTED_LANGUAGES.includes(language as (typeof this.SUPPORTED_LANGUAGES)[number]);
	}

	/**
	 * Detect language by translating a short sample to 'en'.
	 * If the translation matches the original, it's already English; otherwise Spanish.
	 */
	async detectLanguage(text: string): Promise<string | null> {
		if (!text.trim()) return null;

		try {
			await this.rateLimit();

			const sample = text.slice(0, 200);
			const response = await this.translateViaBackend([sample], 'en');
			const translated = response.translations?.[0];

			if (!translated) return null;
			return translated === sample ? 'en' : 'es';
		} catch (error) {
			console.error('Error detecting language:', error);
			return null;
		}
	}

	/**
	 * Translate multiple texts in batch (more efficient)
	 */
	async translateBatch(
		texts: string[],
		targetLanguage: string,
		sourceLanguage?: string
	): Promise<(TranslationResult | TranslationError)[]> {
		if (texts.length === 0) return [];

		if (!this.validateLanguage(targetLanguage)) {
			return texts.map(() => ({
				code: 'UNSUPPORTED_LANGUAGE',
				message: 'Only English and Spanish are supported'
			}));
		}
		if (sourceLanguage && !this.validateLanguage(sourceLanguage)) {
			return texts.map(() => ({
				code: 'UNSUPPORTED_LANGUAGE',
				message: 'Only English and Spanish are supported'
			}));
		}

		const results: (TranslationResult | TranslationError)[] = new Array(texts.length);
		const uncachedIndices: number[] = [];
		const uncachedTexts: string[] = [];

		for (let i = 0; i < texts.length; i++) {
			if (!texts[i].trim()) {
				results[i] = { code: 'EMPTY_TEXT', message: 'Empty text' };
				continue;
			}

			const cacheKey = this.buildCacheKey(texts[i], targetLanguage, sourceLanguage);
			const cached = this.cache.get(cacheKey);
			if (cached && this.isCacheValid(cached)) {
				results[i] = cached.result;
			} else {
				uncachedIndices.push(i);
				uncachedTexts.push(texts[i]);
			}
		}

		if (uncachedTexts.length === 0) return results;

		try {
			await this.rateLimit();

			const response = await this.translateViaBackend(
				uncachedTexts,
				targetLanguage,
				sourceLanguage
			);
			const translations = response.translations;

			for (let j = 0; j < uncachedTexts.length; j++) {
				const originalIndex = uncachedIndices[j];
				const translatedText = translations[j];

				if (translatedText === undefined || translatedText === null) {
					results[originalIndex] = {
						code: 'TRANSLATION_ERROR',
						message: 'No translation returned from API'
					};
					continue;
				}

				const result: TranslationResult = {
					translatedText,
					detectedSourceLanguage:
						sourceLanguage || (translatedText === uncachedTexts[j] ? targetLanguage : undefined),
					originalText: uncachedTexts[j],
					targetLanguage
				};

				this.cache.set(this.buildCacheKey(uncachedTexts[j], targetLanguage, sourceLanguage), {
					result,
					timestamp: Date.now()
				});
				results[originalIndex] = result;
			}
		} catch (error) {
			for (const idx of uncachedIndices) {
				if (!results[idx]) {
					results[idx] = {
						code: 'TRANSLATION_ERROR',
						message: error instanceof Error ? error.message : 'Unknown translation error',
						details: error
					};
				}
			}
		} finally {
			this.saveCacheToStorage();
		}

		return results;
	}

	async translate(
		text: string,
		targetLanguage: string,
		sourceLanguage?: string
	): Promise<TranslationResult | TranslationError> {
		if (!text.trim()) {
			return { code: 'EMPTY_TEXT', message: 'Empty text' };
		}

		if (!this.validateLanguage(targetLanguage)) {
			return { code: 'UNSUPPORTED_LANGUAGE', message: 'Only English and Spanish are supported' };
		}
		if (sourceLanguage && !this.validateLanguage(sourceLanguage)) {
			return { code: 'UNSUPPORTED_LANGUAGE', message: 'Only English and Spanish are supported' };
		}

		const cacheKey = this.buildCacheKey(text, targetLanguage, sourceLanguage);

		if (this.pendingTranslations.has(cacheKey)) {
			return { code: 'PENDING', message: 'Translation already in progress' };
		}

		const cached = this.cache.get(cacheKey);
		if (cached && this.isCacheValid(cached)) {
			return cached.result;
		}

		this.pendingTranslations.add(cacheKey);

		try {
			await this.rateLimit();

			const response = await this.translateViaBackend([text], targetLanguage, sourceLanguage);
			const translatedText = response.translations?.[0];

			if (translatedText === undefined || translatedText === null) {
				throw new Error('No translation returned from API');
			}

			const result: TranslationResult = {
				translatedText,
				detectedSourceLanguage: sourceLanguage || undefined,
				originalText: text,
				targetLanguage
			};

			this.cache.set(cacheKey, { result, timestamp: Date.now() });
			this.saveCacheToStorage();

			return result;
		} catch (error) {
			return {
				code: 'TRANSLATION_ERROR',
				message: error instanceof Error ? error.message : 'Unknown translation error',
				details: error
			};
		} finally {
			this.pendingTranslations.delete(cacheKey);
		}
	}

	clearCache(): void {
		this.cache.clear();
		this.pendingTranslations.clear();
		Preferences.remove({ key: StorageKeys.TRANSLATION_CACHE });
	}

	// -- Private helpers --

	private async translateViaBackend(
		texts: string[],
		targetLanguage: string,
		sourceLanguage?: string
	): Promise<BackendTranslateResponse> {
		const response = await this.post<BackendTranslateResponse>(
			ENDPOINTS.TRANSLATION.TRANSLATE,
			{
				texts,
				targetLanguage,
				...(sourceLanguage && { sourceLanguage })
			},
			{ skipAuthRedirect: true } as AxiosRequestConfig
		);
		return response.data;
	}

	private buildCacheKey(text: string, targetLang: string, sourceLang?: string): string {
		return `${text}-${targetLang}-${sourceLang || 'auto'}`;
	}

	private isCacheValid(cached: CachedTranslation): boolean {
		return Date.now() - cached.timestamp < this.CACHE_DURATION;
	}

	private async loadCacheFromStorage(): Promise<void> {
		if (this.cacheLoaded) return;
		this.cacheLoaded = true;

		try {
			const result = await Preferences.get({ key: StorageKeys.TRANSLATION_CACHE });
			if (result?.value) {
				this.cache = new Map(JSON.parse(result.value));
			}
		} catch (error) {
			console.error('Failed to load translation cache:', error);
		}
	}

	private async saveCacheToStorage(): Promise<void> {
		try {
			const serialized = JSON.stringify(Array.from(this.cache.entries()));
			await Preferences.set({ key: StorageKeys.TRANSLATION_CACHE, value: serialized });
		} catch (error) {
			console.error('Failed to save translation cache:', error);
		}
	}

	/**
	 * Rate limiting to prevent excessive API calls
	 */
	private async rateLimit(): Promise<void> {
		const now = Date.now();
		const timeSinceLastCall = now - this.lastApiCall;

		if (timeSinceLastCall < this.RATE_LIMIT_DELAY) {
			await new Promise((resolve) =>
				setTimeout(resolve, this.RATE_LIMIT_DELAY - timeSinceLastCall)
			);
		}

		this.lastApiCall = Date.now();
	}
}

export const translationService = new TranslationService();
