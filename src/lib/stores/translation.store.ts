/**
 * Translation store with circuit breaker and comprehensive safeguards
 * Only supports English and Spanish translation
 */

import { writable } from 'svelte/store';
import { translationService, type TranslationResult, type TranslationError } from '$lib/services/translation.service';
import { locale } from 'svelte-i18n';
import { browser } from '$app/environment';

export interface TranslationState {
	isTranslating: boolean;
	error: string | null;
	lastTranslation: TranslationResult | null;
}

export interface MessageTranslation {
	messageId: string;
	originalText: string;
	translatedText: string;
	targetLanguage: string;
	sourceLanguage?: string;
	timestamp: number;
}

// Store for individual message translations
const messageTranslations = writable<Map<string, MessageTranslation>>(new Map());

// Store for translation state
const translationState = writable<TranslationState>({
	isTranslating: false,
	error: null,
	lastTranslation: null,
});

// Store for user's translation preferences
const translationPreferences = writable<{
	enabled: boolean;
	autoTranslate: boolean;
	targetLanguage: string;
}>({
	enabled: true,
	autoTranslate: true,
	targetLanguage: 'en',
});

// Circuit breaker for API failures
const circuitBreaker = writable<{
	isOpen: boolean;
	failureCount: number;
	lastFailureTime: number;
	nextAttemptTime: number;
}>({
	isOpen: false,
	failureCount: 0,
	lastFailureTime: 0,
	nextAttemptTime: 0,
});

// Track translated message IDs to prevent duplicates
const translatedMessageIds = new Set<string>();

// Track failed message IDs to prevent retries
const failedMessageIds = new Set<string>();

// Global translation queue to prevent multiple simultaneous API calls
let isTranslatingGlobally = false;
const translationQueue: Array<{
	messageId: string;
	text: string;
	forceRetranslate: boolean;
	resolve: (result: MessageTranslation | null) => void;
	reject: (error: any) => void;
}> = [];

// Load preferences and translations from localStorage on browser
if (browser) {
	// Load preferences
	const saved = localStorage.getItem('translation_preferences');
	if (saved) {
		try {
			const parsed = JSON.parse(saved);
			translationPreferences.set(parsed);
		} catch (error) {
			console.error('Failed to parse translation preferences:', error);
		}
	}

	// Load saved translations
	const savedTranslations = localStorage.getItem('translation_cache_persistent');
	if (savedTranslations) {
		try {
			const parsed = JSON.parse(savedTranslations);
			
			// Handle both old and new cache formats
			let translations: Array<[string, MessageTranslation]>;
			if (parsed.translations && Array.isArray(parsed.translations)) {
				// New format with metadata
				translations = parsed.translations;
			} else if (Array.isArray(parsed)) {
				// Old format (backward compatibility)
				translations = parsed;
			} else {
				throw new Error('Invalid cache format');
			}
			
			const translationsMap = new Map<string, MessageTranslation>(translations);
			messageTranslations.set(translationsMap);
		} catch (error) {
			console.error('Failed to parse saved translations:', error);
			// Clear corrupted cache
			localStorage.removeItem('translation_cache_persistent');
		}
	}
}

// Save preferences to localStorage when they change
translationPreferences.subscribe((prefs) => {
	if (browser) {
		localStorage.setItem('translation_preferences', JSON.stringify(prefs));
	}
});

// Save translations to localStorage when they change (with debouncing)
let saveTimeout: NodeJS.Timeout | null = null;
messageTranslations.subscribe((translations) => {
	if (browser) {
		// Debounce saves to avoid excessive localStorage writes
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
		
		saveTimeout = setTimeout(() => {
			try {
				const serialized = Array.from(translations.entries());
				const cacheData = {
					version: '1.0',
					timestamp: Date.now(),
					translations: serialized
				};
				localStorage.setItem('translation_cache_persistent', JSON.stringify(cacheData));
			} catch (error) {
				console.error('Failed to save translations to localStorage:', error);
				// If localStorage is full, try to clear old translations
				if (error instanceof Error && error.name === 'QuotaExceededError') {
						console.log('LocalStorage full, clearing old translations...');
					TranslationStore.clearOldTranslations(7); // Clear translations older than 7 days
				}
			}
		}, 1000); // 1 second debounce
	}
});

// Derived store for current user language
export const currentUserLanguage = writable<string>('en');
locale.subscribe(($locale) => {
	currentUserLanguage.set($locale || 'en');
});

// Derived store for translation settings
const translationSettings = writable<{
	enabled: boolean;
	autoTranslate: boolean;
	targetLanguage: string;
}>({
	enabled: true,
	autoTranslate: true,
	targetLanguage: 'en',
});

// Update translation settings when preferences or language changes
translationPreferences.subscribe((prefs) => {
	const settings = {
		...prefs,
		targetLanguage: prefs.targetLanguage || 'en',
	};
	// Translation preferences updated
	translationSettings.set(settings);
});

// Update translation settings when user language changes
currentUserLanguage.subscribe((userLang) => {
	translationSettings.update(settings => ({
		...settings,
		targetLanguage: userLang || 'en',
	}));
	// User language updated
});

// Initialize settings on startup
translationPreferences.subscribe((prefs) => {
	const settings = {
		...prefs,
		targetLanguage: prefs.targetLanguage || 'en',
	};
	translationSettings.set(settings);
})();

export class TranslationStore {
	/**
	 * Check circuit breaker state
	 */
	private static checkCircuitBreaker(): boolean {
		let breaker: any;
		circuitBreaker.subscribe((b) => {
			breaker = b;
		})();

		const now = Date.now();
		
		// If circuit is open, check if we should try again
		if (breaker.isOpen) {
			if (now < breaker.nextAttemptTime) {
				return false; // Still in cooldown period
			}
			// Try to close the circuit
			circuitBreaker.update((b) => ({
				...b,
				isOpen: false,
				failureCount: 0,
			}));
		}
		
		return true;
	}

	/**
	 * Update circuit breaker on failure
	 */
	private static updateCircuitBreakerOnFailure(): void {
		const now = Date.now();
		circuitBreaker.update((breaker) => {
			const newFailureCount = breaker.failureCount + 1;
			const shouldOpen = newFailureCount >= 5; // Open after 5 failures
			const nextAttemptTime = shouldOpen ? now + (60000 * Math.pow(2, Math.min(newFailureCount - 5, 6))) : 0; // Exponential backoff
			
			return {
				...breaker,
				isOpen: shouldOpen,
				failureCount: newFailureCount,
				lastFailureTime: now,
				nextAttemptTime,
			};
		});
	}

	/**
	 * Update circuit breaker on success
	 */
	private static updateCircuitBreakerOnSuccess(): void {
		circuitBreaker.update((breaker) => ({
			...breaker,
			failureCount: 0,
			isOpen: false,
		}));
	}

	/**
	 * Get translation for a specific message
	 */
	static getMessageTranslation(messageId: string): MessageTranslation | null {
		let result: MessageTranslation | null = null;
		messageTranslations.subscribe((translations) => {
			result = translations.get(messageId) || null;
		})();
		return result;
	}

	/**
	 * Check if a message has been translated
	 */
	static isMessageTranslated(messageId: string): boolean {
		return this.getMessageTranslation(messageId) !== null;
	}

	/**
	 * Get current user's language preference
	 */
	static getCurrentUserLanguage(): string {
		let userLang = 'en';
		currentUserLanguage.subscribe((lang) => {
			userLang = lang || 'en';
		})();
		return userLang;
	}

	/**
	 * Check if translation is needed for a message
	 */
	static async shouldTranslateMessage(text: string): Promise<boolean> {
		if (!translationService.isAvailable()) {
			return false;
		}

		try {
			
			const sourceLanguage = await translationService.detectLanguage(text);
			const targetLanguage = this.getCurrentUserLanguage();
			
			// Only translate if source language is different from target language
			return !!sourceLanguage && !!targetLanguage && sourceLanguage !== targetLanguage;
		} catch (error) {
			console.log('Language detection failed:', error);
			return false;
		}
	}

	/**
	 * Get cache statistics
	 */
	static getCacheStats(): { size: number; hitRate: number; oldestTranslation?: number } {
		let translations: Map<string, MessageTranslation>;
		messageTranslations.subscribe((t) => {
			translations = t;
		})();

		const size = translations!.size;
		let oldestTimestamp = Infinity;
		
		for (const translation of translations!.values()) {
			if (translation.timestamp < oldestTimestamp) {
				oldestTimestamp = translation.timestamp;
			}
		}

		return {
			size,
			hitRate: 0, // Could be calculated with hit/miss tracking
			oldestTranslation: oldestTimestamp === Infinity ? undefined : oldestTimestamp
		};
	}

	/**
	 * Clear translation cache
	 */
	static clearCache(): void {
		messageTranslations.set(new Map());
		if (browser) {
			localStorage.removeItem('translation_cache_persistent');
		}
	}

	/**
	 * Clear old translations (older than specified days)
	 */
	static clearOldTranslations(daysOld: number = 30): void {
		const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
		let translations: Map<string, MessageTranslation>;
		
		messageTranslations.subscribe((t) => {
			translations = t;
		})();

		const filteredTranslations = new Map<string, MessageTranslation>();
		let removedCount = 0;

		for (const [messageId, translation] of translations!.entries()) {
			if (translation.timestamp > cutoffTime) {
				filteredTranslations.set(messageId, translation);
			} else {
				removedCount++;
			}
		}

		messageTranslations.set(filteredTranslations);
	}

	/**
	 * Export translation cache for backup
	 */
	static exportCache(): string {
		let translations: Map<string, MessageTranslation>;
		messageTranslations.subscribe((t) => {
			translations = t;
		})();

		const exportData = {
			exportDate: new Date().toISOString(),
			version: '1.0',
			translations: Array.from(translations!.entries())
		};

		return JSON.stringify(exportData, null, 2);
	}

	/**
	 * Import translation cache from backup
	 */
	static importCache(backupData: string): boolean {
		try {
			const data = JSON.parse(backupData);
			
			if (!data.translations || !Array.isArray(data.translations)) {
				throw new Error('Invalid backup format');
			}

			const translationsMap = new Map<string, MessageTranslation>(data.translations);
			messageTranslations.set(translationsMap);
			
			return true;
		} catch (error) {
			console.error('Failed to import translation cache:', error);
			return false;
		}
	}

	/**
	 * Preload translations for a conversation
	 */
	static preloadConversationTranslations(messageIds: string[]): void {
		let translations: Map<string, MessageTranslation>;
		messageTranslations.subscribe((t) => {
			translations = t;
		})();

		 messageIds.filter(id => translations!.has(id));
		
	}

	/**
	 * Check if a message has a cached translation
	 */
	static hasCachedTranslation(messageId: string): boolean {
		return this.isMessageTranslated(messageId);
	}

	/**
	 * Get cache size in bytes (approximate)
	 */
	static getCacheSizeBytes(): number {
		if (!browser) return 0;
		
		const cacheData = localStorage.getItem('translation_cache_persistent');
		return cacheData ? new Blob([cacheData]).size : 0;
	}

	/**
	 * Process translation queue
	 */
	private static async processTranslationQueue(): Promise<void> {
		if (isTranslatingGlobally || translationQueue.length === 0) {
			return;
		}

		isTranslatingGlobally = true;

		while (translationQueue.length > 0) {
			const item = translationQueue.shift();
			if (!item) break;

			try {
				const result = await this.performTranslation(
					item.messageId,
					item.text,
					item.forceRetranslate
				);
				item.resolve(result);
			} catch (error) {
				item.reject(error);
			}

			// Add delay between translations to respect rate limits
			if (translationQueue.length > 0) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}

		isTranslatingGlobally = false;
	}

	/**
	 * Translate a message if needed (queued version)
	 */
	static async translateMessage(
		messageId: string,
		text: string,
		forceRetranslate = false
	): Promise<MessageTranslation | null> {

		// Check if already translated and not forcing retranslation
		if (!forceRetranslate && this.isMessageTranslated(messageId)) {
			return this.getMessageTranslation(messageId);
		}

		// Check if already being translated
		if (translatedMessageIds.has(messageId)) {
			return null;
		}

		// Check if message is already in the queue
		const isInQueue = translationQueue.some(item => item.messageId === messageId);
		if (isInQueue) {
			return null;
		}

		// Check if message previously failed (unless forcing retranslate)
		if (!forceRetranslate && failedMessageIds.has(messageId)) {
			return null;
		}

		// Check if translation is enabled
		let settings: any;
		translationSettings.subscribe((s) => {
			settings = s;
		})();

		if (!settings.enabled || !settings.autoTranslate) {
			return null;
		}

		// Check circuit breaker
		if (!this.checkCircuitBreaker()) {
			translationState.update((state) => ({
				...state,
				error: 'Translation service temporarily unavailable due to repeated failures',
			}));
			return null;
		}

		// Check if translation service is available
		if (!translationService.isAvailable()) {
			translationState.update((state) => ({
				...state,
				error: 'Translation service not available - API key missing',
			}));
			return null;
		}

		// Detect source language and check if translation is needed
		try {
			const sourceLanguage = await translationService.detectLanguage(text);
			const targetLanguage = settings.targetLanguage || 'en';
			
			// Only translate if source language is different from target language
			// and both are supported languages
			if (sourceLanguage && sourceLanguage !== targetLanguage) {
				// Translation needed - proceed silently
			} else {
				// No translation needed - skip silently
				return null;
			}
		} catch (error) {
			console.log('Language detection failed, proceeding with translation:', error);
			// Continue with translation even if detection fails
		}

		// Mark as being translated
		translatedMessageIds.add(messageId);

		// Queue the translation
		return new Promise((resolve, reject) => {
			translationQueue.push({
				messageId,
				text,
				forceRetranslate,
				resolve,
				reject
			});

			// Process queue
			this.processTranslationQueue();
		});
	}

	/**
	 * Perform the actual translation
	 */
	private static async performTranslation(
		messageId: string,
		text: string,
		forceRetranslate = false
	): Promise<MessageTranslation | null> {

		// Set translating state
		translationState.update((state) => ({
			...state,
			isTranslating: true,
			error: null,
		}));

		try {
			// Get settings
			let settings: any;
			translationSettings.subscribe((s) => {
				settings = s;
			})();

			// Detect source language first
			const detectedLanguage = await translationService.detectLanguage(text);
			
			// Skip translation if source and target languages are the same
			if (detectedLanguage && translationService.isSameLanguage(detectedLanguage, settings.targetLanguage)) {
				translationState.update((state) => ({
					...state,
					isTranslating: false,
				}));
				translatedMessageIds.delete(messageId);
				return null;
			}

			// Translate the text
			const result = await translationService.translate(
				text,
				settings.targetLanguage,
				detectedLanguage || undefined
			);

			// Check if translation was successful
			if ('code' in result) {
				// Translation failed - update circuit breaker and track failure
				this.updateCircuitBreakerOnFailure();
				failedMessageIds.add(messageId); // Track failed message to prevent retries
				translationState.update((state) => ({
					...state,
					isTranslating: false,
					error: result.message,
				}));
				translatedMessageIds.delete(messageId);
				return null;
			}

			// Success - reset circuit breaker
			this.updateCircuitBreakerOnSuccess();

			// Create translation record
			const translation: MessageTranslation = {
				messageId,
				originalText: text,
				translatedText: result.translatedText,
				targetLanguage: settings.targetLanguage,
				sourceLanguage: result.detectedSourceLanguage,
				timestamp: Date.now(),
			};


			// Store the translation
			messageTranslations.update((translations) => {
				const newMap = new Map(translations);
				newMap.set(messageId, translation);
				return newMap;
			});

			// Update state
			translationState.update((state) => ({
				...state,
				isTranslating: false,
				lastTranslation: result,
				error: null, // Clear any previous errors
			}));

			return translation;
		} catch (error) {
			// Update circuit breaker on error and track failure
			this.updateCircuitBreakerOnFailure();
			failedMessageIds.add(messageId); // Track failed message to prevent retries
			translationState.update((state) => ({
				...state,
				isTranslating: false,
				error: error instanceof Error ? error.message : 'Unknown translation error',
			}));
			return null;
		} finally {
			// Remove from being translated
			translatedMessageIds.delete(messageId);
		}
	}

	/**
	 * Get translated text for a message, or original if not translated
	 */
	static getDisplayText(messageId: string, originalText: string): string {
		const translation = this.getMessageTranslation(messageId);
		return translation ? translation.translatedText : originalText;
	}

	/**
	 * Clear translation for a specific message
	 */
	static clearMessageTranslation(messageId: string): void {
		messageTranslations.update((translations) => {
			const newMap = new Map(translations);
			newMap.delete(messageId);
			return newMap;
		});
		translatedMessageIds.delete(messageId);
	}

	/**
	 * Clear all translations
	 */
	static clearAllTranslations(): void {
		messageTranslations.set(new Map());
		translatedMessageIds.clear();
		failedMessageIds.clear();
		translationService.clearCache();
		
		// Clear persistent storage
		if (browser) {
			localStorage.removeItem('translation_cache_persistent');
		}
	}

	/**
	 * Clear failed message tracking (for retry purposes)
	 */
	static clearFailedMessages(): void {
		failedMessageIds.clear();
	}

	/**
	 * Update translation preferences
	 */
	static updatePreferences(preferences: Partial<typeof translationPreferences>): void {
		translationPreferences.update((current) => ({
			...current,
			...preferences,
		}));
	}

	/**
	 * Toggle translation on/off
	 */
	static toggleTranslation(): void {
		translationPreferences.update((prefs) => ({
			...prefs,
			enabled: !prefs.enabled,
		}));
	}

	/**
	 * Toggle auto-translate on/off
	 */
	static toggleAutoTranslate(): void {
		translationPreferences.update((prefs) => ({
			...prefs,
			autoTranslate: !prefs.autoTranslate,
		}));
	}

	/**
	 * Set target language - only English and Spanish supported
	 */
	static setTargetLanguage(language: string): void {
		// Only allow English and Spanish
		const supportedLanguages = ['en', 'es'];
		const validLanguage = supportedLanguages.includes(language) ? language : 'en';
		
		translationPreferences.update((prefs) => ({
			...prefs,
			targetLanguage: validLanguage,
		}));
	}

	/**
	 * Get current settings
	 */
	static getSettings(): any {
		let settings: any;
		translationSettings.subscribe((s) => {
			settings = s;
		})();
		return settings;
	}
}

// Export stores for reactive usage
export { messageTranslations, translationState, translationPreferences, translationSettings };
