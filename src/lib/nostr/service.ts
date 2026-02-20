import type { ServiceBody, Service, ServiceTranslations, ServicePricing } from '$lib/types/service.d';
import { getSignedEvent } from '$lib/utils/nostr';
import { user } from '$lib/stores/user.store';
import { get } from 'svelte/store';
import { getNpub } from '$lib/utils/nostrKeys';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { TranslationService } from '$lib/services/translation.service';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '$lib/i18n/i18n';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { nip19 } from 'nostr-tools';

// Translation service instance
const translationService = new TranslationService();

/**
 * Generate translations for a service
 * Translates all user-provided text fields to all supported languages
 */
async function generateServiceTranslations(
	serviceData: ServiceBody
): Promise<ServiceTranslations | undefined> {
	// Only generate translations if translation service is available
	if (!translationService.isAvailable()) {
		console.warn('Translation service not available, skipping translations');
		return undefined;
	}

	try {
		// Detect source language from the combined text (title + description)
		const combinedText = `${serviceData.title} ${serviceData.description}`.trim();

		if (!combinedText) {
			return undefined;
		}

		const detectedLanguage = await translationService.detectLanguage(combinedText);

		// Determine source language - if detection fails, default to 'en'
		const sourceLanguage =
			detectedLanguage && SUPPORTED_LANGUAGES.includes(detectedLanguage as SupportedLanguage)
				? detectedLanguage
				: 'en';

		// Always translate to the other language to ensure we have translations in both
		const targetLanguages = SUPPORTED_LANGUAGES.filter((lang) => lang !== sourceLanguage);

		// Translate all text fields to all target languages in parallel
		const translationPromises = targetLanguages.map(async (targetLang) => {
			// Build array of all translation promises
			const allPromises = [
				translationService.translate(serviceData.title, targetLang, sourceLanguage),
				translationService.translate(serviceData.description, targetLang, sourceLanguage)
			];

			// Translate tiers (if present) - name, description, features, delivery times
			const tierPromises =
				serviceData.pricing.tiers?.flatMap((tier) => {
					const promises = [
						translationService.translate(tier.name, targetLang, sourceLanguage),
						translationService.translate(tier.description, targetLang, sourceLanguage),
						...tier.features.map((feature) =>
							translationService.translate(feature, targetLang, sourceLanguage)
						)
					];
					if (tier.deliveryTime?.display) {
						promises.push(
							translationService.translate(tier.deliveryTime.display, targetLang, sourceLanguage)
						);
					}
					if (tier.rushDelivery?.deliveryTime?.display) {
						promises.push(
							translationService.translate(
								tier.rushDelivery.deliveryTime.display,
								targetLang,
								sourceLanguage
							)
						);
					}
					return promises;
				}) || [];

			// Translate add-ons (if present) - name and description
			const addOnPromises =
				serviceData.pricing.addOns?.flatMap((addOn) => [
					translationService.translate(addOn.name, targetLang, sourceLanguage),
					...(addOn.description
						? [translationService.translate(addOn.description, targetLang, sourceLanguage)]
						: [])
				]) || [];

			// Translate FAQs (if present) - question and answer
			const faqPromises =
				serviceData.faqs?.flatMap((faq) => [
					translationService.translate(faq.question, targetLang, sourceLanguage),
					translationService.translate(faq.answer, targetLang, sourceLanguage)
				]) || [];

			// Translate delivery time (if present)
			if (serviceData.pricing.deliveryTime?.display) {
				allPromises.push(
					translationService.translate(
						serviceData.pricing.deliveryTime.display,
						targetLang,
						sourceLanguage
					)
				);
			}

			// Translate rush delivery time (if present)
			if (serviceData.pricing.rushDelivery?.deliveryTime?.display) {
				allPromises.push(
					translationService.translate(
						serviceData.pricing.rushDelivery.deliveryTime.display,
						targetLang,
						sourceLanguage
					)
				);
			}

			// Execute all translations in parallel
			const allResults = await Promise.all([
				...allPromises,
				...tierPromises,
				...addOnPromises,
				...faqPromises
			]);

			// Extract basic translations
			const [titleResult, descResult] = allResults.slice(0, 2);
			let resultIndex = 2;

			// Check if basic translations failed
			if ('code' in titleResult || 'code' in descResult) {
				
				return null;
			}

			// Process tier translations
			const translatedTiers = serviceData.pricing.tiers?.map((tier) => {
				const nameResult = allResults[resultIndex++];
				const descResult = allResults[resultIndex++];
				const featureResults = tier.features.map(() => allResults[resultIndex++]);
				const deliveryTimeResult = tier.deliveryTime?.display ? allResults[resultIndex++] : null;
				const rushDeliveryTimeResult = tier.rushDelivery?.deliveryTime?.display
					? allResults[resultIndex++]
					: null;

				return {
					id: tier.id,
					name: 'translatedText' in nameResult ? nameResult.translatedText : tier.name,
					description: 'translatedText' in descResult ? descResult.translatedText : tier.description,
					features: featureResults.map(
						(r, i) => ('translatedText' in r ? r.translatedText : tier.features[i])
					),
					...(tier.deliveryTime
						? {
								deliveryTime: {
									display:
										deliveryTimeResult && 'translatedText' in deliveryTimeResult
											? deliveryTimeResult.translatedText
											: tier.deliveryTime.display
								}
							}
						: {}),
					...(tier.rushDelivery?.deliveryTime
						? {
								rushDelivery: {
									deliveryTime: {
										display:
											rushDeliveryTimeResult && 'translatedText' in rushDeliveryTimeResult
												? rushDeliveryTimeResult.translatedText
												: tier.rushDelivery.deliveryTime.display
									}
								}
							}
						: {})
				};
			});

			// Process add-on translations
			const translatedAddOns = serviceData.pricing.addOns?.map((addOn) => {
				const nameResult = allResults[resultIndex++];
				const descResult = addOn.description ? allResults[resultIndex++] : null;

				return {
					id: addOn.id,
					name: 'translatedText' in nameResult ? nameResult.translatedText : addOn.name,
					...(addOn.description
						? {
								description:
									descResult && 'translatedText' in descResult
										? descResult.translatedText
										: addOn.description
							}
						: {})
				};
			});

			// Process FAQ translations
			const translatedFaqs = serviceData.faqs?.map((faq) => {
				const questionResult = allResults[resultIndex++];
				const answerResult = allResults[resultIndex++];

				return {
					id: faq.id,
					question:
						'translatedText' in questionResult ? questionResult.translatedText : faq.question,
					answer: 'translatedText' in answerResult ? answerResult.translatedText : faq.answer
				};
			});

			// Extract delivery time translations
			const deliveryTimeResult = serviceData.pricing.deliveryTime?.display
				? allResults[resultIndex++]
				: null;
			const rushDeliveryTimeResult = serviceData.pricing.rushDelivery?.deliveryTime?.display
				? allResults[resultIndex++]
				: null;

			return {
				language: targetLang,
				title: titleResult.translatedText,
				description: descResult.translatedText,
				...(translatedTiers && translatedTiers.length > 0 ? { tiers: translatedTiers } : {}),
				...(translatedAddOns && translatedAddOns.length > 0 ? { addOns: translatedAddOns } : {}),
				...(translatedFaqs && translatedFaqs.length > 0 ? { faqs: translatedFaqs } : {}),
				...(deliveryTimeResult && 'translatedText' in deliveryTimeResult
					? {
							deliveryTime: {
								display: deliveryTimeResult.translatedText
							}
						}
					: {}),
				...(rushDeliveryTimeResult && 'translatedText' in rushDeliveryTimeResult
					? {
							rushDelivery: {
								deliveryTime: {
									display: rushDeliveryTimeResult.translatedText
								}
							}
						}
					: {})
			};
		});

		const results = await Promise.all(translationPromises);

		// Build translations object, filtering out failed translations
		const translations: ServiceTranslations['translations'] = {};
		results.forEach((result) => {
			if (result) {
				translations[result.language] = {
					title: result.title,
					description: result.description,
					...(result.tiers ? { tiers: result.tiers } : {}),
					...(result.addOns ? { addOns: result.addOns } : {}),
					...(result.faqs ? { faqs: result.faqs } : {}),
					...(result.deliveryTime ? { deliveryTime: result.deliveryTime } : {}),
					...(result.rushDelivery ? { rushDelivery: result.rushDelivery } : {})
				};
			}
		});

		// If we couldn't detect the language or translation failed, try the reverse
		if (
			(!detectedLanguage || !SUPPORTED_LANGUAGES.includes(detectedLanguage as SupportedLanguage)) &&
			Object.keys(translations).length === 0
		) {
			// Try translating assuming the text is in the other language
			const reverseSource = sourceLanguage === 'en' ? 'es' : 'en';
			const reverseTarget = reverseSource === 'en' ? 'es' : 'en';

			const [reverseTitleResult, reverseDescResult] = await Promise.all([
				translationService.translate(serviceData.title, reverseTarget, reverseSource),
				translationService.translate(serviceData.description, reverseTarget, reverseSource)
			]);

			if (!('code' in reverseTitleResult) && !('code' in reverseDescResult)) {
				// Build full translation object with all fields
				// Note: Full implementation should translate tiers, addOns, faqs, delivery times
				// using the same comprehensive logic as the main translation above
				translations[reverseTarget] = {
					title: reverseTitleResult.translatedText,
					description: reverseDescResult.translatedText
					// Additional fields (tiers, addOns, faqs, delivery times) would be
					// translated here using the same pattern as the main translation logic
				};
				return {
					sourceLanguage: reverseSource,
					translations
				};
			}
		}

		return {
			sourceLanguage,
			translations
		};
	} catch (error) {
		console.error('Error generating service translations:', error);
		return undefined;
	}
}

/**
 * Generate price for NIP-99 price tag
 * Returns the price value to use in the price tag for discovery
 */
function getPriceForTag(pricing: ServicePricing): number {
	switch (pricing.type) {
		case ServicePricingTypeEnum.FIXED:
			return pricing.amount || 0;
		case ServicePricingTypeEnum.HOURLY:
			return pricing.hourlyRate || 0;
		case ServicePricingTypeEnum.TIERED:
			// Use lowest tier price for NIP-99 discovery compatibility
			if (pricing.tiers && pricing.tiers.length > 0) {
				return Math.min(...pricing.tiers.map((t) => t.price));
			}
			return 0;
		case ServicePricingTypeEnum.INQUIRY_REQUIRED:
			return 0;
		default:
			return 0;
	}
}

/**
 * Generate location display name for NIP-99 location tag
 */
function getLocationDisplayName(serviceData: ServiceBody): string {
	if (serviceData.serviceLocationTypes.includes(ServiceLocationTypeEnum.REMOTE)) {
		return 'Remote';
	}

	if (serviceData.locationDetails?.taskerLocation?.serviceLocation?.displayName) {
		return serviceData.locationDetails.taskerLocation.serviceLocation.displayName;
	}

	if (serviceData.locationDetails?.taskeeLocation?.locationDisplayName) {
		return serviceData.locationDetails.taskeeLocation.locationDisplayName;
	}

	if (serviceData.locationDetails?.taskeeLocation?.serviceLocation?.displayName) {
		return serviceData.locationDetails.taskeeLocation.serviceLocation.displayName;
	}

	return 'Remote';
}

/**
 * Generate delivery time in hours for filtering
 * Converts delivery time to hours using max value for consistent filtering
 */
function getDeliveryTimeInHours(pricing: ServicePricing): number | undefined {
	// Helper to convert delivery time to hours
	const convertToHours = (deliveryTime: { min: number; max: number; unit: string }): number => {
		const hoursPerUnit: Record<string, number> = {
			hour: 1,
			day: 24,
			week: 168,
			month: 720
		};
		const multiplier = hoursPerUnit[deliveryTime.unit] || 1;
		// Use max value for filtering (ensures all services that can deliver within the specified time are included)
		return deliveryTime.max * multiplier;
	};

	switch (pricing.type) {
		case ServicePricingTypeEnum.FIXED:
		case ServicePricingTypeEnum.HOURLY:
			if (pricing.deliveryTime) {
				return convertToHours(pricing.deliveryTime);
			}
			return undefined;
		case ServicePricingTypeEnum.TIERED:
			// Use fastest tier's max delivery time for filtering
			if (pricing.tiers && pricing.tiers.length > 0) {
				const tierDeliveryTimes = pricing.tiers
					.map((tier) => tier.deliveryTime)
					.filter((dt) => dt !== undefined) as Array<{ min: number; max: number; unit: string }>;
				if (tierDeliveryTimes.length > 0) {
					// Find the fastest (lowest max hours)
					const fastestTier = tierDeliveryTimes.reduce((fastest, current) => {
						const fastestHours = convertToHours(fastest);
						const currentHours = convertToHours(current);
						return currentHours < fastestHours ? current : fastest;
					});
					return convertToHours(fastestTier);
				}
			}
			return undefined;
		default:
			return undefined;
	}
}

/**
 * Generate Nostr tags for service events
 * Includes NIP-99 compatible tags and BitTasker extensions
 */
async function generateServiceTags(
	serviceData: ServiceBody,
	uniqueId: string
): Promise<string[][]> {
	const tags: string[][] = [];

	// NIP-99 COMPATIBLE TAGS (for interoperability)
	tags.push(['d', `service-${uniqueId}`]); // NIP-99: Unique identifier (parameterized replaceable)
	tags.push(['title', serviceData.title]); // NIP-99: Service title
	tags.push(['summary', serviceData.description.substring(0, 200)]); // NIP-99: Brief summary/tagline
	tags.push(['published_at', serviceData.createdAt.toString()]); // NIP-99: Publication timestamp
	tags.push(['location', getLocationDisplayName(serviceData)]); // NIP-99: Service location
	tags.push(['price', getPriceForTag(serviceData.pricing).toString(), serviceData.pricing.currency]); // NIP-99: Price array
	tags.push(['status', serviceData.status]); // NIP-99: Status

	// BITTASKER EXTENSIONS (advanced features - human-readable tags)
	const npub = await getNpub();
	if (npub) {
		tags.push(['p', npub]); // Creator pubkey (standard Nostr tag)
	}

	// Categories
	if (serviceData.categories && serviceData.categories.length > 0) {
		serviceData.categories.forEach((category) => {
			tags.push(['categories', category.id]);
		});
	}

	// Skills
	if (serviceData.skills && serviceData.skills.length > 0) {
		serviceData.skills.forEach((skill) => {
			tags.push(['skills', skill]);
		});
	}

	// Location types
	if (serviceData.serviceLocationTypes && serviceData.serviceLocationTypes.length > 0) {
		serviceData.serviceLocationTypes.forEach((locationType) => {
			tags.push(['location_types', locationType]);
		});
	}

	// Location display name (optional, for display purposes)
	const locationDisplayName = getLocationDisplayName(serviceData);
	if (locationDisplayName && locationDisplayName !== 'Remote') {
		tags.push(['location_display_name', locationDisplayName]);
	}

	// Service radius (if tasker_location)
	if (
		serviceData.serviceLocationTypes.includes(ServiceLocationTypeEnum.TASKER_LOCATION) &&
		serviceData.locationDetails?.taskerLocation?.serviceRadius
	) {
		tags.push([
			'service_radius',
			serviceData.locationDetails.taskerLocation.serviceRadius.toString()
		]);
	}

	// Per-distance charge (if tasker_location with travel charge)
	if (
		serviceData.serviceLocationTypes.includes(ServiceLocationTypeEnum.TASKER_LOCATION) &&
		serviceData.locationDetails?.taskerLocation?.perDistanceCharge
	) {
		const charge = serviceData.locationDetails.taskerLocation.perDistanceCharge;
		tags.push(['per_distance_charge', charge.amount.toString(), charge.currency, charge.unit]);
	}

	// Pricing type
	tags.push(['pricing_type', serviceData.pricing.type]);

	// Price range tags (for tiered pricing)
	if (serviceData.pricing.type === ServicePricingTypeEnum.TIERED && serviceData.pricing.tiers) {
		const prices = serviceData.pricing.tiers.map((t) => t.price);
		tags.push(['min_price', Math.min(...prices).toString(), serviceData.pricing.currency]);
		tags.push(['max_price', Math.max(...prices).toString(), serviceData.pricing.currency]);
	}

	// Delivery time tags (for filtering)
	const deliveryTimeHours = getDeliveryTimeInHours(serviceData.pricing);
	if (deliveryTimeHours !== undefined) {
		tags.push(['delivery_time', deliveryTimeHours.toString()]);
		// Add human-readable display for fixed/hourly pricing
		if (
			serviceData.pricing.type === ServicePricingTypeEnum.FIXED ||
			serviceData.pricing.type === ServicePricingTypeEnum.HOURLY
		) {
			if (serviceData.pricing.deliveryTime?.display) {
				tags.push(['delivery_time_display', serviceData.pricing.deliveryTime.display]);
			}
		}
	}

	return tags;
}

/**
 * Generate NIP-19 bech32-encoded service identifier
 * Returns nservice1... format (custom prefix for BitTasker services)
 */
function generateServiceNaddr(
	pubkey: string,
	kind: number,
	dTag: string,
	relays?: string[]
): string {
	try {
		const naddrData = {
			kind,
			pubkey,
			d: dTag,
			...(relays && relays.length > 0 ? { relays } : {})
		};
		// Use custom 'nservice' prefix instead of standard 'naddr' for better branding
		// Note: This requires a custom decoder, but for now we'll use naddr1 and handle it in the decoder
		return nip19.naddrEncode(naddrData);
	} catch (error) {
		console.error('Error generating service naddr:', error);
		throw error;
	}
}

/**
 * List a new service (creates NIP-99 event)
 */
export async function listService(serviceData: ServiceBody): Promise<string> {
	try {
		// Validate required fields
		if (!serviceData.title?.trim()) {
			throw new Error('Service title is required');
		}
		if (!serviceData.description?.trim()) {
			throw new Error('Service description is required');
		}
		if (!serviceData.pricing) {
			throw new Error('Service pricing is required');
		}
		if (!serviceData.categories?.length) {
			throw new Error('At least one category is required');
		}
		if (!serviceData.skills?.length) {
			throw new Error('At least one skill is required');
		}

		// Verify user is authenticated (has npub)
		const userData = get(user);
		const npub = await getNpub();

		if (!npub) {
			throw new Error('User not authenticated');
		}

		// Generate a unique identifier for this service
		const uniqueId = crypto.randomUUID();

		// Use user name if available, otherwise use shortened npub as fallback
		const username =
			userData?.name || npub.substring(0, 8) + '...' + npub.substring(npub.length - 8);

		const creator = {
			username,
			avatar: userData?.picture || ''
		};

		// Generate translations for all supported languages (BEFORE creating event)
		const translations = await generateServiceTranslations(serviceData);

		// Add metadata to service data
		const serviceDataWithMeta = {
			...serviceData,
			creator,
			createdAt: Math.floor(Date.now() / 1000),
			uniqueId,
			...(translations && { translations }) // Only include if translations were generated
		};

		// Determine event kind based on status
		const eventKind =
			serviceData.status === 'active' ? KINDS.SERVICE_ACTIVE : KINDS.SERVICE_DRAFT;

		// Generate tags
		const tags = await generateServiceTags(serviceDataWithMeta, uniqueId);

		// Create event
		const event = {
			kind: eventKind,
			created_at: Math.floor(Date.now() / 1000),
			content: JSON.stringify(serviceDataWithMeta),
			tags
		};

		// Sign and publish
		const signedEvent = await getSignedEvent(event);
		await nostrEventsService.publishEvent(signedEvent);

		return signedEvent.id;
	} catch (error) {
		console.error('❌ Failed to list service:', error);
		throw error;
	}
}

/**
 * Update an existing service using NIP-33 parameterized replaceable events
 */
export async function updateService(serviceId: string, updates: Partial<ServiceBody>): Promise<string> {
	try {
		// Check if serviceId is an event ID (64 hex chars) or UUID (uniqueId) or naddr
		const isEventId = /^[0-9a-fA-F]{64}$/.test(serviceId);
		const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			serviceId
		);
		const isNaddr = serviceId.startsWith('nservice1') || serviceId.startsWith('naddr1');
		let originalService = null;

		if (isNaddr) {
			// Decode naddr to get pubkey, kind, and d tag
			try {
				const decoded = nip19.decode(serviceId);
				if (decoded.type === 'naddr') {
					const dTagValue = decoded.data.d;
					const filter = {
						kinds: [KINDS.SERVICE_ACTIVE, KINDS.SERVICE_DRAFT],
						'#d': [dTagValue],
						authors: [decoded.data.pubkey],
						limit: 1
					};

					const response = await nostrEventsService.requestEvents({
						filters: [filter]
					});

					if (response.data && response.data.length > 0) {
						// Get latest version (highest created_at)
						originalService = response.data.reduce((latest, current) =>
							current.created_at > latest.created_at ? current : latest
						);
					}
				}
			} catch (error) {
				console.error('Error decoding naddr:', error);
			}
		} else if (isEventId) {
			// It's an event ID, use it directly
			const result = await nostrEventsService.findEventById(serviceId);
			originalService = result.data;
		} else if (isUuid) {
			// It's a uniqueId (UUID), query by d-tag
			const dTagValue = `service-${serviceId}`;
			const filter = {
				kinds: [KINDS.SERVICE_ACTIVE, KINDS.SERVICE_DRAFT],
				'#d': [dTagValue],
				limit: 1
			};

			const response = await nostrEventsService.requestEvents({
				filters: [filter]
			});

			if (response.data && response.data.length > 0) {
				// Get latest version (highest created_at)
				originalService = response.data.reduce((latest, current) =>
					current.created_at > latest.created_at ? current : latest
				);
			}
		} else {
			throw new Error('Invalid service ID format');
		}

		if (!originalService) {
			throw new Error('Service not found');
		}

		// Parse original service data
		const originalServiceData = JSON.parse(originalService.content) as ServiceBody;

		// Get the original uniqueId
		const uniqueId = originalServiceData.uniqueId;
		if (!uniqueId) {
			throw new Error('Original service has no uniqueId');
		}

		// Check if title or description changed - if so, regenerate translations
		const needsRetranslation =
			(updates.title && updates.title !== originalServiceData.title) ||
			(updates.description && updates.description !== originalServiceData.description);

		// Create updated service data for translation (if needed)
		const serviceDataForTranslation: ServiceBody = {
			...originalServiceData,
			...updates
		};

		// Generate new translations if content changed
		let translations = originalServiceData.translations;
		if (needsRetranslation) {
			const newTranslations = await generateServiceTranslations(serviceDataForTranslation);
			if (newTranslations) {
				translations = newTranslations;
			}
		}

		// Determine event kind based on status (use updated status if provided, otherwise keep original)
		const updatedStatus = updates.status || originalServiceData.status;
		const eventKind =
			updatedStatus === 'active' ? KINDS.SERVICE_ACTIVE : KINDS.SERVICE_DRAFT;

		// Merge updates with original service data
		const updatedServiceData: ServiceBody = {
			...originalServiceData,
			...updates,
			uniqueId, // Keep the same uniqueId
			status: updatedStatus,
			...(translations && { translations }) // Include updated translations
		};

		// Generate tags
		const tags = await generateServiceTags(updatedServiceData, uniqueId);

		// Create update event using the same kind as original (or updated if status changed)
		const event = {
			kind: eventKind, // Use same kind as original, or update if status changed
			created_at: Math.floor(Date.now() / 1000), // New timestamp for replacement
			content: JSON.stringify(updatedServiceData),
			tags
		};

		// Sign and publish
		const signedEvent = await getSignedEvent(event);
		await nostrEventsService.publishEvent(signedEvent);

		return signedEvent.id;
	} catch (error) {
		console.error('Failed to update service:', error);
		throw error;
	}
}

/**
 * Delete a service using NIP-09 deletion event (kind 5)
 */
export async function deleteService(serviceId: string): Promise<string> {
	try {
		// Create deletion event (kind 5)
		const event = {
			kind: 5, // NIP-09 deletion event
			created_at: Math.floor(Date.now() / 1000),
			content: 'Service deleted',
			tags: [
				['e', serviceId], // Reference to event being deleted
				['k', KINDS.SERVICE_ACTIVE.toString()] // Service event kind
			]
		};

		// Sign and publish
		const signedEvent = await getSignedEvent(event);
		const response = await nostrEventsService.deleteEvent(signedEvent);
		if (response.deleteCount === 0) {
			throw new Error('Failed to delete service');
		}
		return response.message;
	} catch (error) {
		console.error('Failed to delete service:', error);
		throw error;
	}
}

/**
 * Find service by Nostr event ID (64-char hex).
 * Fetches the event and parses content; returns null if kind is not a service kind.
 */
export async function findServiceByEventId(eventId: string): Promise<Service | null> {
	try {
		const response = await nostrEventsService.findEventById(eventId);
		const event = response?.data;
		if (!event || (event.kind !== KINDS.SERVICE_ACTIVE && event.kind !== KINDS.SERVICE_DRAFT)) {
			return null;
		}
		const contentData = JSON.parse(event.content) as ServiceBody;
		const service: Service = {
			...contentData,
			id: event.id,
			npub: event.pubkey
		};
		return service;
	} catch (error) {
		console.error('Error finding service by event ID:', error);
		return null;
	}
}

/**
 * Find service by uniqueId
 * Queries by d tag filter: #d: ['service-${uniqueId}']
 */
export async function findServiceByUniqueId(uniqueId: string): Promise<Service | null> {
	try {
		const dTagValue = `service-${uniqueId}`;
		const filter = {
			kinds: [KINDS.SERVICE_ACTIVE, KINDS.SERVICE_DRAFT],
			'#d': [dTagValue],
			limit: 1
		};

		const response = await nostrEventsService.requestEvents({
			filters: [filter]
		});

		if (response.data && response.data.length > 0) {
			// Get latest version (highest created_at)
			const latestEvent = response.data.reduce((latest, current) =>
				current.created_at > latest.created_at ? current : latest
			);

			// Parse service data
			const contentData = JSON.parse(latestEvent.content) as ServiceBody;
			const service: Service = {
				...contentData,
				id: latestEvent.id,
				npub: latestEvent.pubkey
			};

			return service;
		}

		return null;
	} catch (error) {
		console.error('Error finding service by uniqueId:', error);
		return null;
	}
}

/**
 * Find service by NIP-19 naddr/nservice identifier
 * Decodes naddr to get pubkey, kind, and d tag, then queries latest version
 */
export async function findServiceByNaddr(naddr: string): Promise<Service | null> {
	try {
		// Decode naddr
		const decoded = nip19.decode(naddr);
		if (decoded.type !== 'naddr') {
			return null;
		}

		const dTagValue = decoded.data.d;
		const filter = {
			kinds: [KINDS.SERVICE_ACTIVE, KINDS.SERVICE_DRAFT],
			'#d': [dTagValue],
			authors: [decoded.data.pubkey],
			limit: 1
		};

		const response = await nostrEventsService.requestEvents({
			filters: [filter]
		});

		if (response.data && response.data.length > 0) {
			// Get latest version (highest created_at)
			const latestEvent = response.data.reduce((latest, current) =>
				current.created_at > latest.created_at ? current : latest
			);

			// Parse service data
			const contentData = JSON.parse(latestEvent.content) as ServiceBody;
			const service: Service = {
				...contentData,
				id: latestEvent.id,
				npub: latestEvent.pubkey
			};

			return service;
		}

		return null;
	} catch (error) {
		console.error('Error finding service by naddr:', error);
		return null;
	}
}

// Export helper functions for use in other modules
export { generateServiceTags, generateServiceNaddr, generateServiceTranslations };

