/**
 * Bid translation utilities
 * Generates translations for bid content (description, proposedApproach, coverLetter)
 */

import { translationService, type TranslationResult } from '$lib/services/translation.service';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '$lib/i18n/i18n';
import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';

/**
 * Bid translations structure
 */
export interface BidTranslations {
	sourceLanguage: string;
	translations: {
		[language: string]: {
			description: string;
			proposedApproach: string;
			coverLetter: string;
		};
	};
}

/**
 * Generate translations for a bid.
 * Uses the user's current locale as the source language to avoid an extra
 * detectLanguage API call, since the user is composing text in their selected language.
 */
export async function generateBidTranslations(bidData: {
	description: string;
	proposedApproach: string;
	coverLetter: string;
}): Promise<BidTranslations | undefined> {
	try {
		// Combine all text fields for language detection
		const combinedText =
			`${bidData.description} ${bidData.proposedApproach} ${bidData.coverLetter}`.trim();

		// If all fields are empty, return undefined
		if (!combinedText) {
			return undefined;
		}

		const currentLocale = get(locale) ?? 'en';
		const sourceLanguage: SupportedLanguage = (SUPPORTED_LANGUAGES as readonly string[]).includes(
			currentLocale
		)
			? (currentLocale as SupportedLanguage)
			: 'en';

		// Get all supported languages except the source language
		const targetLanguages = SUPPORTED_LANGUAGES.filter((lang) => lang !== sourceLanguage);

		// If no target languages (bid is already in all supported languages), return empty
		if (targetLanguages.length === 0) {
			return {
				sourceLanguage,
				translations: {}
			};
		}

		// Translate all fields to all target languages in parallel
		const translationPromises = targetLanguages.map(async (targetLang) => {
			const [descResult, approachResult, coverResult] = await Promise.all([
				bidData.description.trim()
					? translationService.translate(bidData.description, targetLang, sourceLanguage)
					: Promise.resolve({ translatedText: '' } as TranslationResult),
				bidData.proposedApproach.trim()
					? translationService.translate(bidData.proposedApproach, targetLang, sourceLanguage)
					: Promise.resolve({ translatedText: '' } as TranslationResult),
				bidData.coverLetter.trim()
					? translationService.translate(bidData.coverLetter, targetLang, sourceLanguage)
					: Promise.resolve({ translatedText: '' } as TranslationResult)
			]);

			// Check if translation failed
			if ('code' in descResult || 'code' in approachResult || 'code' in coverResult) {
				console.warn(`Bid translation failed for ${targetLang}`);
				return null;
			}

			return {
				language: targetLang,
				description: descResult.translatedText || bidData.description,
				proposedApproach: approachResult.translatedText || bidData.proposedApproach,
				coverLetter: coverResult.translatedText || bidData.coverLetter
			};
		});

		const results = await Promise.all(translationPromises);

		// Build translations object, filtering out failed translations
		const translations: BidTranslations['translations'] = {};
		results.forEach((result) => {
			if (result) {
				translations[result.language] = {
					description: result.description,
					proposedApproach: result.proposedApproach,
					coverLetter: result.coverLetter
				};
			}
		});

		return {
			sourceLanguage,
			translations
		};
	} catch (error) {
		console.error('Error generating bid translations:', error);
		return undefined;
	}
}
