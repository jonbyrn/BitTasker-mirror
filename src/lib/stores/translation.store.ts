/**
 * Translation store for chat message translations.
 * Manages translation state, circuit breaker, and message translation queue.
 * Only supports English and Spanish.
 */

import { writable, get } from 'svelte/store';
import { translationService, type TranslationResult } from '$lib/services/translation.service';
import { locale } from 'svelte-i18n';
import { browser } from '$app/environment';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

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

// --- Stores ---

const messageTranslations = writable<Map<string, MessageTranslation>>(new Map());

const translationState = writable<TranslationState>({
	isTranslating: false,
	error: null,
	lastTranslation: null
});

const translationPreferences = writable<{ enabled: boolean }>({ enabled: false });

const translationSettings = writable<{
	enabled: boolean;
	autoTranslate: boolean;
	targetLanguage: string;
}>({
	enabled: false,
	autoTranslate: true,
	targetLanguage: 'en'
});

export const currentUserLanguage = writable<string>('en');

// --- Circuit breaker ---

const circuitBreaker = writable<{
	isOpen: boolean;
	failureCount: number;
	lastFailureTime: number;
	nextAttemptTime: number;
}>({
	isOpen: false,
	failureCount: 0,
	lastFailureTime: 0,
	nextAttemptTime: 0
});

// --- In-flight tracking ---

const translatedMessageIds = new Set<string>();
const failedMessageIds = new Set<string>();

let isTranslatingGlobally = false;
const translationQueue: Array<{
	messageId: string;
	text: string;
	forceRetranslate: boolean;
	resolve: (result: MessageTranslation | null) => void;
	reject: (error: unknown) => void;
}> = [];

// --- Persistence (Preferences-based) ---

async function loadPersistedState(): Promise<void> {
	try {
		const [prefsResult, cacheResult] = await Promise.all([
			Preferences.get({ key: StorageKeys.TRANSLATION_PREFERENCES }),
			Preferences.get({ key: StorageKeys.TRANSLATION_MSG_CACHE })
		]);

		if (prefsResult.value) {
			translationPreferences.set(JSON.parse(prefsResult.value));
		}

		if (cacheResult.value) {
			const parsed = JSON.parse(cacheResult.value);
			const entries: Array<[string, MessageTranslation]> = parsed.translations ?? parsed;
			messageTranslations.set(new Map(entries));
		}
	} catch (error) {
		console.error('Failed to load translation persisted state:', error);
	}
}

if (browser) {
	loadPersistedState();
}

// Save preferences when they change (skip the initial hydration)
let prefsInitialized = false;
translationPreferences.subscribe((prefs) => {
	if (!prefsInitialized) {
		prefsInitialized = true;
		return;
	}
	if (browser) {
		Preferences.set({
			key: StorageKeys.TRANSLATION_PREFERENCES,
			value: JSON.stringify(prefs)
		});
	}
});

// Debounced save of message translations
let msgSaveTimeout: ReturnType<typeof setTimeout> | null = null;
messageTranslations.subscribe((translations) => {
	if (!browser) return;
	if (msgSaveTimeout) clearTimeout(msgSaveTimeout);

	msgSaveTimeout = setTimeout(() => {
		try {
			const serialized = JSON.stringify(Array.from(translations.entries()));
			Preferences.set({ key: StorageKeys.TRANSLATION_MSG_CACHE, value: serialized });
		} catch (error) {
			console.error('Failed to persist message translations:', error);
			if (error instanceof Error && error.name === 'QuotaExceededError') {
				TranslationStore.clearOldTranslations(7);
			}
		}
	}, 1000);
});

// --- Reactive wiring ---

locale.subscribe(($locale) => {
	currentUserLanguage.set($locale || 'en');
});

translationPreferences.subscribe((prefs) => {
	const currentLang = get(currentUserLanguage) || 'en';
	translationSettings.set({
		enabled: prefs.enabled,
		autoTranslate: true,
		targetLanguage: currentLang
	});
});

currentUserLanguage.subscribe((userLang) => {
	translationSettings.update((s) => ({ ...s, targetLanguage: userLang || 'en' }));
});

// --- TranslationStore ---

export class TranslationStore {
	/** Toggle translation on/off */
	static toggleTranslation(): void {
		translationPreferences.update((prefs) => ({ ...prefs, enabled: !prefs.enabled }));
	}

	/** Check if a message has been translated */
	static isMessageTranslated(messageId: string): boolean {
		return get(messageTranslations).has(messageId);
	}

	/** Translate a single message (queued) */
	static async translateMessage(
		messageId: string,
		text: string,
		forceRetranslate = false
	): Promise<MessageTranslation | null> {
		if (!forceRetranslate && this.isMessageTranslated(messageId)) {
			return get(messageTranslations).get(messageId) ?? null;
		}
		if (translatedMessageIds.has(messageId)) return null;
		if (translationQueue.some((item) => item.messageId === messageId)) return null;
		if (!forceRetranslate && failedMessageIds.has(messageId)) return null;

		const settings = get(translationSettings);
		if (!settings.enabled) return null;
		if (!this.checkCircuitBreaker()) {
			translationState.update((s) => ({
				...s,
				error: 'Translation service temporarily unavailable due to repeated failures'
			}));
			return null;
		}

		translatedMessageIds.add(messageId);

		return new Promise((resolve, reject) => {
			translationQueue.push({ messageId, text, forceRetranslate, resolve, reject });
			this.processTranslationQueue();
		});
	}

	/** Translate multiple messages in batch */
	static async translateMessagesBatch(
		messages: Array<{ messageId: string; text: string }>,
		forceRetranslate = false
	): Promise<Map<string, MessageTranslation>> {
		const results = new Map<string, MessageTranslation>();
		if (messages.length === 0) return results;

		const settings = get(translationSettings);
		if (!settings.enabled) return results;

		const messagesToTranslate = messages.filter(({ messageId, text }) => {
			if (!forceRetranslate && this.isMessageTranslated(messageId)) return false;
			if (translatedMessageIds.has(messageId)) return false;
			if (translationQueue.some((item) => item.messageId === messageId)) return false;
			if (!forceRetranslate && failedMessageIds.has(messageId)) return false;
			if (!text.trim() || text.trim().length < 3) return false;
			return true;
		});

		if (messagesToTranslate.length === 0) return results;

		if (!this.checkCircuitBreaker()) {
			translationState.update((s) => ({
				...s,
				error: 'Translation service temporarily unavailable due to repeated failures'
			}));
			return results;
		}

		const targetLanguage = settings.targetLanguage || 'en';

		messagesToTranslate.forEach(({ messageId }) => translatedMessageIds.add(messageId));
		translationState.update((s) => ({ ...s, isTranslating: true, error: null }));

		try {
			const texts = messagesToTranslate.map((m) => m.text);
			const translationResults = await translationService.translateBatch(texts, targetLanguage);

			translationResults.forEach((result, index) => {
				const { messageId } = messagesToTranslate[index];

				if ('code' in result) {
					failedMessageIds.add(messageId);
					translatedMessageIds.delete(messageId);
					return;
				}

				const sourceLang = result.detectedSourceLanguage || 'auto';
				if (sourceLang && sourceLang !== targetLanguage) {
					const translation: MessageTranslation = {
						messageId,
						originalText: result.originalText,
						translatedText: result.translatedText,
						sourceLanguage: sourceLang,
						targetLanguage: result.targetLanguage,
						timestamp: Date.now()
					};

					messageTranslations.update((map) => {
						const newMap = new Map(map);
						newMap.set(messageId, translation);
						return newMap;
					});
					results.set(messageId, translation);
				}

				translatedMessageIds.delete(messageId);
			});

			this.updateCircuitBreakerOnSuccess();
		} catch (error) {
			console.error('Batch translation error:', error);
			translationState.update((s) => ({
				...s,
				error: error instanceof Error ? error.message : 'Translation failed'
			}));
			messagesToTranslate.forEach(({ messageId }) => {
				failedMessageIds.add(messageId);
				translatedMessageIds.delete(messageId);
			});
			this.updateCircuitBreakerOnFailure();
		} finally {
			translationState.update((s) => ({ ...s, isTranslating: false }));
		}

		return results;
	}

	/** Remove translations older than N days (used by quota-exceeded handler) */
	static clearOldTranslations(daysOld: number = 30): void {
		const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
		const translations = get(messageTranslations);
		const filtered = new Map<string, MessageTranslation>();

		for (const [id, t] of translations.entries()) {
			if (t.timestamp > cutoffTime) filtered.set(id, t);
		}

		messageTranslations.set(filtered);
	}

	// --- Private helpers ---

	private static checkCircuitBreaker(): boolean {
		const breaker = get(circuitBreaker);
		const now = Date.now();

		if (breaker.isOpen) {
			if (now < breaker.nextAttemptTime) return false;
			circuitBreaker.update((b) => ({ ...b, isOpen: false, failureCount: 0 }));
		}

		return true;
	}

	private static updateCircuitBreakerOnFailure(): void {
		const now = Date.now();
		circuitBreaker.update((b) => {
			const count = b.failureCount + 1;
			const shouldOpen = count >= 5;
			return {
				...b,
				isOpen: shouldOpen,
				failureCount: count,
				lastFailureTime: now,
				nextAttemptTime: shouldOpen ? now + 60000 * Math.pow(2, Math.min(count - 5, 6)) : 0
			};
		});
	}

	private static updateCircuitBreakerOnSuccess(): void {
		circuitBreaker.update((b) => ({ ...b, failureCount: 0, isOpen: false }));
	}

	private static async processTranslationQueue(): Promise<void> {
		if (isTranslatingGlobally || translationQueue.length === 0) return;

		isTranslatingGlobally = true;

		while (translationQueue.length > 0) {
			const item = translationQueue.shift();
			if (!item) break;

			try {
				const result = await this.performTranslation(item.messageId, item.text);
				item.resolve(result);
			} catch (error) {
				item.reject(error);
			}

			if (translationQueue.length > 0) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		isTranslatingGlobally = false;
	}

	private static async performTranslation(
		messageId: string,
		text: string
	): Promise<MessageTranslation | null> {
		translationState.update((s) => ({ ...s, isTranslating: true, error: null }));

		try {
			const settings = get(translationSettings);
			const result = await translationService.translate(text, settings.targetLanguage);

			if ('code' in result) {
				this.updateCircuitBreakerOnFailure();
				failedMessageIds.add(messageId);
				translationState.update((s) => ({ ...s, isTranslating: false, error: result.message }));
				translatedMessageIds.delete(messageId);
				return null;
			}

			this.updateCircuitBreakerOnSuccess();

			const translation: MessageTranslation = {
				messageId,
				originalText: text,
				translatedText: result.translatedText,
				targetLanguage: settings.targetLanguage,
				sourceLanguage: result.detectedSourceLanguage,
				timestamp: Date.now()
			};

			messageTranslations.update((map) => {
				const newMap = new Map(map);
				newMap.set(messageId, translation);
				return newMap;
			});

			translationState.update((s) => ({
				...s,
				isTranslating: false,
				lastTranslation: result,
				error: null
			}));

			return translation;
		} catch (error) {
			this.updateCircuitBreakerOnFailure();
			failedMessageIds.add(messageId);
			translationState.update((s) => ({
				...s,
				isTranslating: false,
				error: error instanceof Error ? error.message : 'Unknown translation error'
			}));
			return null;
		} finally {
			translatedMessageIds.delete(messageId);
		}
	}
}

export { messageTranslations, translationState, translationSettings };
