import type { NostrProfile, NostrProfileImage, Skill, PortfolioItem, Availability, NostrStandardServices, ProfileTranslations, SkillTranslations, CertificationTranslations, PortfolioTranslations } from '$lib/types/profile.d';
import { type NostrEvent, type Filter, nip19 } from 'nostr-tools';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { getNpub } from '$lib/utils/nostrKeys';
import { getSignedEvent } from '$lib/utils/nostr';
import uploadService from '$lib/api/services/upload.service';
import KINDS from '$lib/utils/constants/kinds';
import { TranslationService, type TranslationResult } from '$lib/services/translation.service';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '$lib/i18n/i18n';
import type { SubCloser } from 'nostr-tools/abstract-pool';

// Translation service instance
const translationService = new TranslationService();

const pool = get(appStore).pool;
const RELAYS = get(appStore).relays;

// Subscription store for profile updates
const profileSubscriptions = new Map<
	string,
	{
		sub: SubCloser;
		callbacks: Set<(event: NostrEvent) => void>;
		relays: string[];
	}
>();

// Helper function to create subscription key
export function createSubscriptionKey(
	npub: string,
	kindFilters?: { [kind: number]: { [tag: string]: string } | null | undefined }
): string {
	if (!kindFilters) {
		return `${npub}:default`;
	}
	const kinds = Object.keys(kindFilters).sort().join(',');
	const tags = Object.entries(kindFilters)
		.map(([tagFilters]) => {
			if (!tagFilters) return '';
			return Object.entries(tagFilters)
				.map(([tag, value]) => `${tag}:${value}`)
				.sort()
				.join(';');
		})
		.filter(Boolean)
		.join('|');
	return `${npub}:${kinds}:${tags}`;
}

/**
 * Subscribe to profile updates for a given public key
 * @param callback Function to call when profile is updated
 * @param kindFilters Map of event kinds to their tag filters (e.g. {30001: {'d': 'portfolio', 't': 'portfolio'}, 1063: {'d': 'portfolio-images'}})
 * @param relays Relay URLs to subscribe to
 * @returns Cleanup function to unsubscribe
 */
export async function subscribeToProfileUpdates(
	callback: (event: NostrEvent) => void,
	kindFilters?: { [kind: number]: { [tag: string]: string } | null | undefined },
	relays = RELAYS
): Promise<() => void> {
	let npub: string;

	try {
		// Wait for the public key
		npub = await getNpub();
		if (!npub) {
			console.error('No public key found');
			return () => { };
		}

		// Create a unique subscription key based on npub and filters
		const subscriptionKey = createSubscriptionKey(npub, kindFilters);

		// Check if we already have a subscription for this specific combination
		if (!profileSubscriptions.has(subscriptionKey)) {
			// Create separate filters for each kind
			const filters: Filter[] = [];

			if (kindFilters) {
				Object.entries(kindFilters).forEach(([kindStr, tagFilters]) => {
					const kind = parseInt(kindStr);
					const filter: Filter & { [key: `#${string}`]: string[] } = {
						authors: [npub],
						kinds: [kind],
						limit: 10
					};

					// Add tag filters if they exist
					if (tagFilters) {
						Object.entries(tagFilters).forEach(([tag, value]) => {
							const tagKey = `#${tag}` as `#${string}`;
							filter[tagKey] = [value];
						});
					}

					filters.push(filter);
				});
			} else {
				// If no kind filters specified, create a default filter
				filters.push({
					authors: [npub],
					limit: 10
				});
			}

			// Create separate subscriptions for each filter
			const subs = filters.map((filter) =>
				pool.subscribe(relays, filter, {
					onevent(event: NostrEvent) {
						const subs = profileSubscriptions.get(subscriptionKey);
						if (subs) {
							for (const cb of subs.callbacks) {
								cb(event);
							}
						}
					}
				})
			);

			// Store all subscriptions
			profileSubscriptions.set(subscriptionKey, {
				sub: {
					close: () => subs.forEach((sub) => sub.close())
				},
				callbacks: new Set([callback]),
				relays
			});
		} else {
			// Add callback to existing subscription
			profileSubscriptions.get(subscriptionKey)?.callbacks.add(callback);
		}

		// Return cleanup function
		return () => {
			const subs = profileSubscriptions.get(subscriptionKey);
			if (subs) {
				subs.callbacks.delete(callback);
				if (subs.callbacks.size === 0) {
					subs.sub.close();
					profileSubscriptions.delete(subscriptionKey);
				}
			}
		};
	} catch (err) {
		console.error('Failed to get public key:', err);
		return () => { };
	}
}

/**
 * Generate translations for profile fields
 * Translates professionalTitle and about to all supported languages
 */
export async function generateProfileTranslations(profileData: {
	professionalTitle?: string;
	about?: string;
}): Promise<ProfileTranslations | undefined> {
	// Only generate translations if translation service is available
	if (!translationService.isAvailable()) {
		console.warn('Translation service not available, skipping profile translations');
		return undefined;
	}

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
	// Only generate translations if translation service is available
	if (!translationService.isAvailable()) {
		console.warn('Translation service not available, skipping skill translations');
		return undefined;
	}

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
		} else if (fallbackLocale && SUPPORTED_LANGUAGES.includes(fallbackLocale as SupportedLanguage)) {
			sourceLanguage = fallbackLocale;
		} else {
			sourceLanguage = 'en';
		}

		// Always translate to the other language to ensure we have translations in both
		const targetLanguages = SUPPORTED_LANGUAGES.filter(lang => lang !== sourceLanguage);

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
		results.forEach(result => {
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
	// Only generate translations if translation service is available
	if (!translationService.isAvailable()) {
		console.warn('Translation service not available, skipping certification translations');
		return undefined;
	}

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
		const sourceLanguage = (detectedLanguage && SUPPORTED_LANGUAGES.includes(detectedLanguage as SupportedLanguage))
			? detectedLanguage
			: 'en';

		// Always translate to the other language to ensure we have translations in both
		const targetLanguages = SUPPORTED_LANGUAGES.filter(lang => lang !== sourceLanguage);

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
		results.forEach(result => {
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
	// Only generate translations if translation service is available
	if (!translationService.isAvailable()) {
		console.warn('Translation service not available, skipping portfolio translations');
		return undefined;
	}

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
		} else if (fallbackLocale && SUPPORTED_LANGUAGES.includes(fallbackLocale as SupportedLanguage)) {
			sourceLanguage = fallbackLocale;
		} else {
			sourceLanguage = 'en';
		}

		// Always translate to the other language to ensure we have translations in both
		const targetLanguages = SUPPORTED_LANGUAGES.filter(lang => lang !== sourceLanguage);

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
		results.forEach(result => {
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
 * Publish a profile metadata event to Nostr with improved error handling and retries
 */
export async function publishProfileMetadata(
	metadata: NostrProfile,
	existingMetadata: NostrProfile = {},
	relays = RELAYS
): Promise<NostrEvent> {
	// Merge new metadata with existing, giving priority to new values
	// Only override fields that are explicitly provided (not undefined/null/empty)
	const mergedMetadata: NostrProfile = { ...existingMetadata };

	// Update fields that are provided in the new metadata
	if (metadata.name !== undefined) mergedMetadata.name = metadata.name;
	if (metadata.display_name !== undefined) mergedMetadata.display_name = metadata.display_name;
	if (metadata.about !== undefined) mergedMetadata.about = metadata.about;
	if (metadata.picture !== undefined) mergedMetadata.picture = metadata.picture;
	if (metadata.banner !== undefined) mergedMetadata.banner = metadata.banner;
	if (metadata.website !== undefined) mergedMetadata.website = metadata.website;
	if (metadata.nip05 !== undefined) mergedMetadata.nip05 = metadata.nip05;
	if (metadata.lud16 !== undefined) mergedMetadata.lud16 = metadata.lud16;
	if (metadata.lud06 !== undefined) mergedMetadata.lud06 = metadata.lud06;
	if (metadata.professionalTitle !== undefined)
		mergedMetadata.professionalTitle = metadata.professionalTitle;
	if (metadata.location !== undefined) mergedMetadata.location = metadata.location;

	// Handle translations - if provided in metadata, use them; otherwise preserve existing
	if (metadata.translations !== undefined) {
		mergedMetadata.translations = metadata.translations;
	}

	// Handle legacy pictures field (should not be included in kind 0 events)
	if (metadata.pictures !== undefined) {
		delete mergedMetadata.pictures;
	}

	// Create metadata event
	const event: Partial<NostrEvent> = {
		kind: 0,
		created_at: Math.floor(Date.now() / 1000),
		content: JSON.stringify(mergedMetadata),
		tags: []
	};

	const signedEvent = await getSignedEvent(event);

	try {
		// Publish with timeout and retry logic
		const maxRetries = 3;
		const timeout = 5000; // 5 seconds

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const publishPromises = relays.map(
					(relay) =>
						new Promise<void>((resolve, reject) => {
							const pub = pool.publish([relay], signedEvent);
							const timeoutId = setTimeout(() => {
								reject(new Error(`Publish to ${relay} timed out`));
							}, timeout);

							Promise.all(pub)
								.then(() => {
									clearTimeout(timeoutId);
									resolve();
								})
								.catch(reject);
						})
				);

				await Promise.all(publishPromises);
				return signedEvent;
			} catch (err) {
				if (attempt === maxRetries) throw err;
				console.warn(`Retry ${attempt} failed, retrying...`);
				await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
			}
		}

		throw new Error('Failed to publish after all retries');
	} catch (error) {
		console.error('Error publishing to relays:', error);
		throw error;
	}
}

/**
 * Publish mutliple profile images
 * @param images
 * @param eventId
 * @param identifier
 * @param relays
 * @returns
 */
export async function publishMultipleImages(
	images: NostrProfileImage[],
	eventId: string | null,
	identifier: string,
	relays = RELAYS
): Promise<string[]> {
	try {
		// Always use kind 30063 for replaceable events
		const event: Partial<NostrEvent> = {
			kind: KINDS.PROFILE_IMAGES, // Replaceable event for profile images
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['d', identifier] // Identifier for this replaceable event
			],
			content: JSON.stringify(images)
		};

		if (!event) {
			throw new Error('Event is undefined');
		}

		const signedEvent = await getSignedEvent(event);
		const pub = await Promise.all(pool.publish(relays, signedEvent));

		return pub;
	} catch (error) {
		console.error('Error publishing multiple images:', error);
		throw error;
	}
}

/**
 * Delete a Nostr event by its ID
 * @param eventId The ID of the event to delete
 * @param relays Optional array of relay URLs
 */
export async function deleteNostrEvent(
	eventId: string,
	eventKind?: string,
	relays = RELAYS
): Promise<void> {
	try {
		const npub = await getNpub();
		if (!npub) {
			console.error('No public key found');
			return;
		}

		const event: Partial<NostrEvent> = {
			kind: 5, // Event deletion (NIP-09)
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['e', eventId],
				['k', eventKind || '']
			], // Reference to the event being deleted
			content: 'Delete previous profile images',
			pubkey: npub
		};

		const signedEvent = await getSignedEvent(event);
		await Promise.all(pool.publish(relays, signedEvent));
	} catch (error) {
		console.error('Error deleting Nostr event:', error);
		throw error;
	}
}

/**
 * Cleanup function - only use when completely shutting down
 */
export function closeNostrPool(): void {
	if (profileSubscriptions.size === 0) return;

	// Close all subscriptions
	for (const [_, subs] of profileSubscriptions) {
		console.log(_);
		subs.sub.close();
	}
	profileSubscriptions.clear();

	// Close pool
	pool.close(RELAYS);
}

/**
 * Publish skills update to Nostr
 */
export async function publishSkillsUpdate(
	skills: Skill[],
	relays = RELAYS
): Promise<void> {
	try {
		// Get current locale from svelte-i18n if available
		let currentLocale: string | undefined;
		try {
			const { get } = await import('svelte/store');
			const { locale } = await import('svelte-i18n');
			currentLocale = get(locale) || undefined;
		} catch {
			// If svelte-i18n is not available, continue without locale
		}

		// Generate translations for skills that don't have them yet
		const skillsWithTranslations = await Promise.all(
			skills.map(async (skill) => {
				// Only generate translations if skill doesn't already have them
				if (!skill.translations && skill.name.trim()) {
					const translations = await generateSkillTranslations(skill.name, currentLocale);
					return {
						...skill,
						...(translations && { translations })
					};
				}
				return skill;
			})
		);

		// Create skills event (kind 30000 is replaceable)
		const skillsEvent = {
			kind: KINDS.PROFILE_SKILLS,
			created_at: Math.floor(Date.now() / 1000),
			tags: [['d', 'skills']],
			content: JSON.stringify(skillsWithTranslations)
		};

		const signedSkillsEvent = await getSignedEvent(skillsEvent);

		pool.publish(relays, signedSkillsEvent);
	} catch (error) {
		console.error('Failed to publish skills update:', error);
		throw error;
	}
}

/**
 * Upload a certification file and create a Nostr event for it
 */
export async function uploadCertification(
	certification: {
		skillId: string;
		name: string;
		issuer: string;
		date: string;
		file: File;
	},
	relays = RELAYS
): Promise<string> {
	try {
		// Upload file
		const uploadResult = await uploadService.uploadSingleFile(certification.file, {
			folder: 'certifications'
		});

		// Create certification file event (kind 1063 for file metadata)
		const certEvent = {
			kind: KINDS.FILE_METADATA,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['d', 'certification'],
				['x', uploadResult.key],
				['m', certification.file.type],
				['alt', certification.file.name],
				['skill', certification.skillId]
			],
			content: JSON.stringify({
				name: certification.name,
				issuer: certification.issuer,
				date: certification.date,
				fileUrl: uploadResult.url,
				verified: false
			})
		};

		const signedCertEvent = await getSignedEvent(certEvent);

		// Publish event
		pool.publish(relays, signedCertEvent);

		return signedCertEvent.id;
	} catch (error) {
		console.error('Failed to upload certification:', error);
		throw error;
	}
}

/**
 * Publish a portfolio item
 */
export async function publishPortfolioItem(
	item: PortfolioItem,
	tags: string[][],
	relays = RELAYS
): Promise<void> {
	try {
		// Get current locale from svelte-i18n if available
		let currentLocale: string | undefined;
		try {
			const { get } = await import('svelte/store');
			const { locale } = await import('svelte-i18n');
			currentLocale = get(locale) || undefined;
		} catch {
			// If svelte-i18n is not available, continue without locale
		}

		// Generate translations for portfolio item if it doesn't already have them
		let itemWithTranslations = item;
		if (!item.translations && item.title.trim() && item.description.trim()) {
			const translations = await generatePortfolioTranslations(
				{
					title: item.title,
					description: item.description
				},
				currentLocale
			);
			if (translations) {
				itemWithTranslations = {
					...item,
					translations
				};
			}
		}

		// Create portfolio item event
		const itemEvent = {
			kind: KINDS.PROFILE_PORTFOLIO,
			created_at: Math.floor(Date.now() / 1000),
			tags,
			content: JSON.stringify(itemWithTranslations)
		};

		const signedEvent = await getSignedEvent(itemEvent);
		await Promise.all(pool.publish(relays, signedEvent));
	} catch (error) {
		console.error('Failed to publish portfolio item:', error);
		throw error;
	}
}

/**
 * Delete a portfolio item
 */
export async function deletePortfolioItem(id: string, relays = RELAYS): Promise<void> {
	try {
		// Create deletion event according to NIP-09
		const deleteEvent = {
			kind: 5,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['e', id], // Event being deleted
				['k', KINDS.PROFILE_PORTFOLIO.toString()] // Kind of event being deleted
			],
			content: 'Portfolio item deleted' // Optional reason
		};

		const signedEvent = await getSignedEvent(deleteEvent);
		await Promise.all(pool.publish(relays, signedEvent));
	} catch (error) {
		console.error('Error deleting portfolio item:', error);
		throw error;
	}
}

/**
 * Publishes user availability update to Nostr
 * Uses kind 30002 (parameterized replaceable event) with 'd' tag for 'availability'
 */
export async function publishAvailabilityUpdate(availability: Availability): Promise<void> {
	try {
		const event = {
			kind: KINDS.PROFILE_AVAILABILITY,
			created_at: Math.floor(Date.now() / 1000),
			tags: [['d', 'availability']],
			content: JSON.stringify(availability)
		};

		const signedEvent = await getSignedEvent(event);
		await Promise.all(pool.publish(RELAYS, signedEvent));
	} catch (error) {
		console.error('Failed to publish availability update:', error);
		throw error;
	}
}

/**
 * Publishes standard services data to Nostr
 * @param servicesData The services data to publish
 * @param tags Additional tags to include
 */
export async function publishStandardServices(
	servicesData: NostrStandardServices,
	tags: string[][],
	relays = RELAYS
): Promise<void> {
	try {
		const event = {
			kind: KINDS.PROFILE_STANDARD_SERVICES,
			created_at: Math.floor(Date.now() / 1000),
			content: JSON.stringify(servicesData),
			tags: [...tags]
		};

		const signedEvent = await getSignedEvent(event);
		await Promise.all(pool.publish(relays, signedEvent));
	} catch (error) {
		console.error('Failed to publish standard services:', error);
		throw error;
	}
}

/**
 * Deletes a standard service event from Nostr
 * @param eventId The ID of the event to delete
 */
export async function deleteStandardService(eventId: string, relays = RELAYS): Promise<void> {
	try {
		const event = {
			kind: 5,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['e', eventId],
				['k', KINDS.PROFILE_STANDARD_SERVICES.toString()]
			],
			content: 'Standard service deleted'
		};

		const signedEvent = await getSignedEvent(event);
		await Promise.all(pool.publish(relays, signedEvent));
	} catch (error) {
		console.error('Failed to delete standard service:', error);
		throw error;
	}
}

/**
 * Get a Nostr event by its ID
 * @param eventId The ID of the event to fetch
 * @param relays Optional array of relay URLs
 * @returns Promise resolving to the event or null if not found
 */
export async function getEventById(eventId: string, relays = RELAYS): Promise<NostrEvent | null> {
	try {
		const filter: Filter = {
			ids: [eventId]
		};

		// Use get method instead of list
		const event = await pool.get(relays, filter);
		return event || null;
	} catch (error) {
		console.error('Error fetching event by ID:', error);
		throw error;
	}
}

export async function getProfileMetaData(npub: string): Promise<NostrEvent | null> {
	try {
		if (npub.startsWith('npub')) {
			const decoded = nip19.decode(npub);
			if (decoded.type === 'npub') {
				npub = decoded.data as string;
			}
		}

		const filter: Filter = {
			authors: [npub],
			kinds: [KINDS.PROFILE_METADATA],
			limit: 20
		};

		const event = await pool.get(RELAYS, filter);
		return event || null;
	} catch (error) {
		console.error('Error fetching profile metadata:', error);
		return null;
	}
}