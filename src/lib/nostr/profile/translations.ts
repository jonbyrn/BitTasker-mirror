import type {
	ProfileTranslations,
	SkillTranslations,
	CertificationTranslations,
	PortfolioTranslations,
	LanguageTranslations,
	NostrProfileLanguage
} from '$lib/types/profile.d';
import { translationService, type TranslationResult } from '$lib/services/translation.service';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '$lib/i18n/i18n';

/**
 * Generate translations for profile fields
 * Translates professionalTitle and about to all supported languages
 */
export async function generateProfileTranslations(profileData: {
	professionalTitle?: string;
	about?: string;
}): Promise<ProfileTranslations | undefined> {
	try {
		// Combine all text fields for language detection
		const combinedText = `${profileData.professionalTitle || ''} ${profileData.about || ''}`.trim();

		// If all fields are empty, return undefined
		if (!combinedText) {
			return undefined;
		}

		// Detect source language from the combined text
		const detectedLanguage = await translationService.detectLanguage(combinedText);

		// If we can't detect language or it's not supported, default to 'en'
		const sourceLanguage = detectedLanguage || 'en';

		// Get all supported languages except the source language
		const targetLanguages = SUPPORTED_LANGUAGES.filter((lang) => lang !== sourceLanguage);

		// If no target languages (profile is already in all supported languages), return empty
		if (targetLanguages.length === 0) {
			return {
				sourceLanguage,
				translations: {}
			};
		}

		// Translate all fields to all target languages in parallel
		const translationPromises = targetLanguages.map(async (targetLang) => {
			const [titleResult, aboutResult] = await Promise.all([
				profileData.professionalTitle?.trim()
					? translationService.translate(profileData.professionalTitle, targetLang, sourceLanguage)
					: Promise.resolve({ translatedText: '' } as TranslationResult),
				profileData.about?.trim()
					? translationService.translate(profileData.about, targetLang, sourceLanguage)
					: Promise.resolve({ translatedText: '' } as TranslationResult)
			]);

			// Check if translation failed
			if ('code' in titleResult || 'code' in aboutResult) {
				console.warn(`Profile translation failed for ${targetLang}`);
				return null;
			}

			return {
				language: targetLang,
				professionalTitle: titleResult.translatedText || profileData.professionalTitle || '',
				about: aboutResult.translatedText || profileData.about || ''
			};
		});

		const results = await Promise.all(translationPromises);

		// Build translations object, filtering out failed translations
		const translations: ProfileTranslations['translations'] = {};
		results.forEach((result) => {
			if (result) {
				translations[result.language] = {
					professionalTitle: result.professionalTitle,
					about: result.about
				};
			}
		});

		return {
			sourceLanguage,
			translations
		};
	} catch (error) {
		console.error('Error generating profile translations:', error);
		return undefined;
	}
}

/**
 * Generate translations for skills
 * @param skillName The name of the skill to translate
 * @param fallbackLocale Optional locale to use if language detection fails or detects unsupported language
 */
export async function generateSkillTranslations(
	skillName: string,
	fallbackLocale?: string
): Promise<SkillTranslations | undefined> {
	try {
		// If skill name is empty, return undefined
		if (!skillName.trim()) {
			return undefined;
		}

		// Detect source language from the skill name
		const detectedLanguage = await translationService.detectLanguage(skillName);

		// Determine source language:
		// 1. If detected language is supported, use it
		// 2. If fallback locale is provided and supported, use it
		// 3. Otherwise, default to 'en'
		let sourceLanguage: string;
		if (detectedLanguage && SUPPORTED_LANGUAGES.includes(detectedLanguage as SupportedLanguage)) {
			sourceLanguage = detectedLanguage;
		} else if (
			fallbackLocale &&
			SUPPORTED_LANGUAGES.includes(fallbackLocale as SupportedLanguage)
		) {
			sourceLanguage = fallbackLocale;
		} else {
			sourceLanguage = 'en';
		}

		// Always translate to the other language to ensure we have translations in both
		const targetLanguages = SUPPORTED_LANGUAGES.filter((lang) => lang !== sourceLanguage);

		// If no target languages (skill is already in all supported languages), return empty
		if (targetLanguages.length === 0) {
			return {
				sourceLanguage,
				translations: {}
			};
		}

		// Translate skill name to all target languages in parallel
		const translationPromises = targetLanguages.map(async (targetLang) => {
			const result = await translationService.translate(skillName, targetLang, sourceLanguage);

			// Check if translation failed
			if ('code' in result) {
				console.warn(`Skill translation failed for ${targetLang}`);
				return null;
			}

			return {
				language: targetLang,
				name: result.translatedText || skillName
			};
		});

		const results = await Promise.all(translationPromises);

		// Build translations object, filtering out failed translations
		const translations: SkillTranslations['translations'] = {};
		results.forEach((result) => {
			if (result) {
				translations[result.language] = {
					name: result.name
				};
			}
		});

		return {
			sourceLanguage,
			translations
		};
	} catch (error) {
		console.error('Error generating skill translations:', error);
		return undefined;
	}
}

/**
 * Generate translations for certifications
 */
export async function generateCertificationTranslations(
	certificationName: string,
	issuer: string
): Promise<CertificationTranslations | undefined> {
	try {
		// Combine name and issuer for language detection
		const combinedText = `${certificationName || ''} ${issuer || ''}`.trim();

		// If all fields are empty, return undefined
		if (!combinedText) {
			return undefined;
		}

		// Detect source language from the combined text
		const detectedLanguage = await translationService.detectLanguage(combinedText);

		// Determine source language - if detection fails or language is not supported, default to 'en'
		// but we'll still translate to ensure both languages are available
		const sourceLanguage =
			detectedLanguage && SUPPORTED_LANGUAGES.includes(detectedLanguage as SupportedLanguage)
				? detectedLanguage
				: 'en';

		// Always translate to the other language to ensure we have translations in both
		const targetLanguages = SUPPORTED_LANGUAGES.filter((lang) => lang !== sourceLanguage);

		// If no target languages (certification is already in all supported languages), return empty
		if (targetLanguages.length === 0) {
			return {
				sourceLanguage,
				translations: {}
			};
		}

		// Translate certification name and issuer to all target languages in parallel
		const translationPromises = targetLanguages.map(async (targetLang) => {
			const [nameResult, issuerResult] = await Promise.all([
				certificationName?.trim()
					? translationService.translate(certificationName, targetLang, sourceLanguage)
					: Promise.resolve({ translatedText: '' } as TranslationResult),
				issuer?.trim()
					? translationService.translate(issuer, targetLang, sourceLanguage)
					: Promise.resolve({ translatedText: '' } as TranslationResult)
			]);

			// Check if translation failed
			if ('code' in nameResult || 'code' in issuerResult) {
				console.warn(`Certification translation failed for ${targetLang}`);
				return null;
			}

			return {
				language: targetLang,
				name: nameResult.translatedText || certificationName || '',
				issuer: issuerResult.translatedText || issuer || ''
			};
		});

		const results = await Promise.all(translationPromises);

		// Build translations object, filtering out failed translations
		const translations: CertificationTranslations['translations'] = {};
		results.forEach((result) => {
			if (result) {
				translations[result.language] = {
					name: result.name,
					issuer: result.issuer
				};
			}
		});

		return {
			sourceLanguage,
			translations
		};
	} catch (error) {
		console.error('Error generating certification translations:', error);
		return undefined;
	}
}

/**
 * Generate translations for portfolio items
 * @param portfolioData The portfolio item data to translate
 * @param fallbackLocale Optional locale to use if language detection fails or detects unsupported language
 */
export async function generatePortfolioTranslations(
	portfolioData: {
		title: string;
		description: string;
	},
	fallbackLocale?: string
): Promise<PortfolioTranslations | undefined> {
	try {
		// Combine title and description for language detection
		const combinedText = `${portfolioData.title || ''} ${portfolioData.description || ''}`.trim();

		// If all fields are empty, return undefined
		if (!combinedText) {
			return undefined;
		}

		// Detect source language from the combined text
		const detectedLanguage = await translationService.detectLanguage(combinedText);

		// Determine source language:
		// 1. If detected language is supported, use it
		// 2. If fallback locale is provided and supported, use it
		// 3. Otherwise, default to 'en'
		let sourceLanguage: string;
		if (detectedLanguage && SUPPORTED_LANGUAGES.includes(detectedLanguage as SupportedLanguage)) {
			sourceLanguage = detectedLanguage;
		} else if (
			fallbackLocale &&
			SUPPORTED_LANGUAGES.includes(fallbackLocale as SupportedLanguage)
		) {
			sourceLanguage = fallbackLocale;
		} else {
			sourceLanguage = 'en';
		}

		// Always translate to the other language to ensure we have translations in both
		const targetLanguages = SUPPORTED_LANGUAGES.filter((lang) => lang !== sourceLanguage);

		// If no target languages (portfolio is already in all supported languages), return empty
		if (targetLanguages.length === 0) {
			return {
				sourceLanguage,
				translations: {}
			};
		}

		// Translate title and description to all target languages in parallel
		const translationPromises = targetLanguages.map(async (targetLang) => {
			const [titleResult, descResult] = await Promise.all([
				portfolioData.title?.trim()
					? translationService.translate(portfolioData.title, targetLang, sourceLanguage)
					: Promise.resolve({ translatedText: '' } as TranslationResult),
				portfolioData.description?.trim()
					? translationService.translate(portfolioData.description, targetLang, sourceLanguage)
					: Promise.resolve({ translatedText: '' } as TranslationResult)
			]);

			// Check if translation failed
			if ('code' in titleResult || 'code' in descResult) {
				console.warn(`Portfolio translation failed for ${targetLang}`);
				return null;
			}

			return {
				language: targetLang,
				title: titleResult.translatedText || portfolioData.title || '',
				description: descResult.translatedText || portfolioData.description || ''
			};
		});

		const results = await Promise.all(translationPromises);

		// Build translations object, filtering out failed translations
		const translations: PortfolioTranslations['translations'] = {};
		results.forEach((result) => {
			if (result) {
				translations[result.language] = {
					title: result.title,
					description: result.description
				};
			}
		});

		return {
			sourceLanguage,
			translations
		};
	} catch (error) {
		console.error('Error generating portfolio translations:', error);
		return undefined;
	}
}

/**
 * Generate translations for profile language proficiency labels
 * Translates proficiency strings (native, fluent, etc.) to all supported languages
 */
export async function generateLanguageTranslations(
	languages: NostrProfileLanguage[]
): Promise<LanguageTranslations | undefined> {
	try {
		if (!languages || languages.length === 0) {
			return undefined;
		}

		// Filter to languages with non-empty codes
		const validLanguages = languages.filter((lang) => lang.code?.trim());
		if (validLanguages.length === 0) {
			return undefined;
		}

		// Build combined text from proficiency labels for language detection
		const combinedText = validLanguages
			.map((lang) => lang.proficiency || '')
			.join(' ')
			.trim();
		if (!combinedText) {
			return undefined;
		}

		// Detect source language
		const detectedLanguage = await translationService.detectLanguage(combinedText);
		const sourceLanguage =
			detectedLanguage && SUPPORTED_LANGUAGES.includes(detectedLanguage as SupportedLanguage)
				? detectedLanguage
				: 'en';

		// Get target languages (all except source)
		const targetLanguages = SUPPORTED_LANGUAGES.filter((lang) => lang !== sourceLanguage);
		if (targetLanguages.length === 0) {
			return {
				sourceLanguage,
				translations: {}
			};
		}

		// Collect unique proficiency labels to translate
		const uniqueProficiencies = [
			...new Set(validLanguages.map((l) => l.proficiency || '').filter(Boolean))
		];

		// Translate all proficiency labels to all target languages
		const translationPromises = targetLanguages.map(async (targetLang) => {
			const proficiencyTranslations = await Promise.all(
				uniqueProficiencies.map(async (prof) => {
					const result = await translationService.translate(prof, targetLang, sourceLanguage);
					if ('code' in result) {
						console.warn(`Language proficiency translation failed for ${targetLang}: ${prof}`);
						return { original: prof, translated: prof };
					}
					return { original: prof, translated: result.translatedText || prof };
				})
			);

			// Build a proficiency map for this language
			const profMap: Record<string, string> = {};
			proficiencyTranslations.forEach(({ original, translated }) => {
				profMap[original] = translated;
			});

			// Build the translated proficiency string: join all translated labels
			const translatedProficiency = validLanguages
				.map((lang) => profMap[lang.proficiency || ''] || lang.proficiency || '')
				.join(', ');

			return {
				language: targetLang,
				proficiency: translatedProficiency
			};
		});

		const results = await Promise.all(translationPromises);

		const translations: LanguageTranslations['translations'] = {};
		results.forEach((result) => {
			if (result) {
				translations[result.language] = {
					proficiency: result.proficiency
				};
			}
		});

		return {
			sourceLanguage,
			translations
		};
	} catch (error) {
		console.error('Error generating language translations:', error);
		return undefined;
	}
}
