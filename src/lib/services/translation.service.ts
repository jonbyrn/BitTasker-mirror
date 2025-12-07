/**
 * Google Translate API service with comprehensive safeguards
 * Only supports English and Spanish translation
 */

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

export class TranslationService {
	private apiKey: string;
	private baseUrl = 'https://translation.googleapis.com/language/translate/v2';
	private cache = new Map<string, CachedTranslation>();
	private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
	private readonly RATE_LIMIT_DELAY = 1000; // 1 second between calls
	private lastApiCall = 0;
	private pendingTranslations = new Set<string>();
	private readonly SUPPORTED_LANGUAGES = ['en', 'es'] as const;

	constructor() {
		this.apiKey = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY;
		if (!this.apiKey) {
			console.warn('Google Translate API key not found. Translation features will be disabled.');
		}
		this.loadCacheFromStorage();
	}

	/**
	 * Check if translation service is available
	 */
	isAvailable(): boolean {
		return !!this.apiKey;
	}

	/**
	 * Validate language code - only English and Spanish supported
	 */
	private validateLanguage(language: string): boolean {
		return this.SUPPORTED_LANGUAGES.includes(language as any);
	}

	/**
	 * Detect the language of the given text
	 */
	async detectLanguage(text: string): Promise<string | null> {
		if (!this.isAvailable() || !text.trim()) {
			return null;
		}

		try {
			await this.rateLimit();

			const response = await fetch(`${this.baseUrl}/detect?key=${this.apiKey}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					q: text,
				}),
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			const detectedLang = data.data?.detections?.[0]?.[0]?.language || null;
			
			// Only return if it's a supported language
			return this.validateLanguage(detectedLang) ? detectedLang : null;
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
		if (!this.isAvailable() || texts.length === 0) {
			return texts.map(() => ({
				code: 'NO_API_KEY',
				message: 'Translation service not available',
			}));
		}

		// Validate language codes
		if (!this.validateLanguage(targetLanguage)) {
			return texts.map(() => ({
				code: 'UNSUPPORTED_LANGUAGE',
				message: 'Only English and Spanish are supported',
			}));
		}
		if (sourceLanguage && !this.validateLanguage(sourceLanguage)) {
			return texts.map(() => ({
				code: 'UNSUPPORTED_LANGUAGE',
				message: 'Only English and Spanish are supported',
			}));
		}

		// Filter out empty texts
		const validTexts = texts.filter(t => t.trim());
		if (validTexts.length === 0) {
			return texts.map(() => ({
				code: 'EMPTY_TEXT',
				message: 'Empty text',
			}));
		}

		try {
			// Apply rate limiting
			await this.rateLimit();

			const requestBody: {
				q: string[];
				target: string;
				format: string;
				source?: string;
			} = {
				q: validTexts,
				target: targetLanguage,
				format: 'text',
			};

			if (sourceLanguage) {
				requestBody.source = sourceLanguage;
			}

			// Add timeout to prevent hanging requests
			const controller = new AbortController();
			const timeoutId = setTimeout(() => {
				controller.abort();
			}, 30000); // 30 second timeout

			const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
				);
			}

			const data = await response.json();
			const translations = data.data?.translations || [];

			// Map results back to original texts array (including empty ones)
			let validIndex = 0;
			return texts.map((text) => {
				if (!text.trim()) {
					return {
						code: 'EMPTY_TEXT',
						message: 'Empty text',
					};
				}

				const translation = translations[validIndex++];
				if (!translation) {
					return {
						code: 'TRANSLATION_ERROR',
						message: 'No translation returned from API',
					};
				}

				const result: TranslationResult = {
					translatedText: translation.translatedText,
					detectedSourceLanguage: translation.detectedSourceLanguage,
					originalText: text,
					targetLanguage,
				};

				// Cache the result
				const cacheKey = `${text}-${targetLanguage}-${sourceLanguage || 'auto'}`;
				this.cache.set(cacheKey, {
					result,
					timestamp: Date.now()
				});

				return result;
			});
		} catch (error) {
			return texts.map(() => ({
				code: 'TRANSLATION_ERROR',
				message: error instanceof Error ? error.message : 'Unknown translation error',
				details: error,
			}));
		} finally {
			// Save cache to localStorage
			this.saveCacheToStorage();
		}
	}

	/**
	 * Translate text from source language to target language
	 */
	async translate(
		text: string,
		targetLanguage: string,
		sourceLanguage?: string
	): Promise<TranslationResult | TranslationError> {
		if (!this.isAvailable() || !text.trim()) {
			return {
				code: 'NO_API_KEY',
				message: 'Translation service not available',
			};
		}

		// Validate language codes
		if (!this.validateLanguage(targetLanguage)) {
			return {
				code: 'UNSUPPORTED_LANGUAGE',
				message: 'Only English and Spanish are supported',
			};
		}
		if (sourceLanguage && !this.validateLanguage(sourceLanguage)) {
			return {
				code: 'UNSUPPORTED_LANGUAGE',
				message: 'Only English and Spanish are supported',
			};
		}

		// Create cache key
		const cacheKey = `${text}-${targetLanguage}-${sourceLanguage || 'auto'}`;
		
		// Check if translation is already pending
		if (this.pendingTranslations.has(cacheKey)) {
			return {
				code: 'PENDING',
				message: 'Translation already in progress',
			};
		}
		
		// Check cache first
		const cached = this.cache.get(cacheKey);
		if (cached && this.isCacheValid(cached)) {
			return cached.result;
		}

		// Add to pending translations
		this.pendingTranslations.add(cacheKey);

		try {
			// Apply rate limiting
			await this.rateLimit();

			const requestBody: {
				q: string;
				target: string;
				format: string;
				source?: string;
			} = {
				q: text,
				target: targetLanguage,
				format: 'text',
			};

			if (sourceLanguage) {
				requestBody.source = sourceLanguage;
			}

			// Add timeout to prevent hanging requests
			const controller = new AbortController();
			const timeoutId = setTimeout(() => {
				controller.abort();
			}, 30000); // 30 second timeout

			const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
				);
			}

			const data = await response.json();
			const translation = data.data?.translations?.[0];

			if (!translation) {
				throw new Error('No translation returned from API');
			}

			const result: TranslationResult = {
				translatedText: translation.translatedText,
				detectedSourceLanguage: translation.detectedSourceLanguage,
				originalText: text,
				targetLanguage,
			};

			// Cache the result with timestamp
			this.cache.set(cacheKey, {
				result,
				timestamp: Date.now()
			});

			// Save cache to localStorage
			this.saveCacheToStorage();

			return result;
		} catch (error) {
			return {
				code: 'TRANSLATION_ERROR',
				message: error instanceof Error ? error.message : 'Unknown translation error',
				details: error,
			};
		} finally {
			// Remove from pending translations
			this.pendingTranslations.delete(cacheKey);
		}
	}

	/**
	 * Check if a cached translation is still valid
	 */
	private isCacheValid(cached: CachedTranslation): boolean {
		const now = Date.now();
		return (now - cached.timestamp) < this.CACHE_DURATION;
	}

	/**
	 * Load cache from localStorage
	 */
	private loadCacheFromStorage(): void {
		if (typeof window === 'undefined') return;
		
		try {
			const stored = localStorage.getItem('translation_cache');
			if (stored) {
				const parsed = JSON.parse(stored);
				this.cache = new Map(parsed);
			}
		} catch (error) {
			console.error('Failed to load translation cache:', error);
		}
	}

	/**
	 * Save cache to localStorage
	 */
	private saveCacheToStorage(): void {
		if (typeof window === 'undefined') return;
		
		try {
			const serialized = Array.from(this.cache.entries());
			localStorage.setItem('translation_cache', JSON.stringify(serialized));
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
			await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY - timeSinceLastCall));
		}
		
		this.lastApiCall = Date.now();
	}

	/**
	 * Clear the translation cache
	 */
	clearCache(): void {
		this.cache.clear();
		this.pendingTranslations.clear();
		if (typeof window !== 'undefined') {
			localStorage.removeItem('translation_cache');
		}
	}

	/**
	 * Get supported languages - only English and Spanish
	 */
	getSupportedLanguages(): string[] {
		return [...this.SUPPORTED_LANGUAGES];
	}

	/**
	 * Check if two languages are the same
	 */
	isSameLanguage(lang1: string, lang2: string): boolean {
		const normalize = (lang: string) => lang.split('-')[0].toLowerCase();
		return normalize(lang1) === normalize(lang2);
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { size: number; hitRate: number } {
		return {
			size: this.cache.size,
			hitRate: 0 // Would need to track hits/misses for accurate rate
		};
	}
}

// Export singleton instance
export const translationService = new TranslationService();
