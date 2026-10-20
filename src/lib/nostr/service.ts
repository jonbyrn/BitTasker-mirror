import type {
	ServiceBody,
	Service,
	ServiceTranslations,
	ServicePricing
} from '$lib/types/service.d';
import { getSignedEvent } from '$lib/utils/nostr';
import { queueSearchDelete, queueSearchUpsert, serviceToSearchDocument } from '$lib/search/catalog';
import { user } from '$lib/stores/user.store';
import { get } from 'svelte/store';
import { getNpub } from '$lib/utils/nostrKeys';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { TAGS } from '$lib/utils/constants/tags';
import { TranslationService } from '$lib/services/translation.service';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '$lib/i18n/i18n';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { createServiceEditConflictError } from '$lib/utils/service-edit-conflict';
import {
	normalizeServiceTierDeliveryTimes,
	tierDeliveryTimeToHours
} from '$lib/utils/serviceTierDelivery';
import { nip19 } from 'nostr-tools';
import { getExactServiceLocation, publishExactServiceLocation } from '$lib/nostr/exact-location';
import { sanitizeServiceForPublicPublish } from '$lib/utils/location/public-location';

// Translation service instance
const translationService = new TranslationService();

/**
 * Generate a human-readable d-tag for service events (like tasks).
 * Format: service-{slug}-{createdAt}-{suffix} for SEO and stable identification.
 */
function getReadableServiceDTag(title: string, createdAt: number, npub?: string): string {
	const slug =
		title
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.slice(0, 50) || 'service';
	const fromNpub = npub ? npub.replace(/[^a-z0-9]/gi, '').slice(0, 6) : '';
	const suffix =
		fromNpub.length >= 6
			? fromNpub
			: Array.from(crypto.getRandomValues(new Uint8Array(3)))
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
	return `service-${slug}-${createdAt}-${suffix}`;
}

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
					description:
						'translatedText' in descResult ? descResult.translatedText : tier.description,
					features: featureResults.map((r, i) =>
						'translatedText' in r ? r.translatedText : tier.features[i]
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
	switch (pricing.type) {
		case ServicePricingTypeEnum.FIXED:
		case ServicePricingTypeEnum.HOURLY:
			if (pricing.deliveryTime) {
				const hoursPerUnit: Record<string, number> = {
					hour: 1,
					day: 24,
					week: 168,
					month: 720
				};
				return pricing.deliveryTime.max * (hoursPerUnit[pricing.deliveryTime.unit] || 1);
			}
			return undefined;
		case ServicePricingTypeEnum.TIERED:
			// Use fastest tier's max delivery time for filtering
			if (pricing.tiers && pricing.tiers.length > 0) {
				const tierDeliveryTimes = pricing.tiers
					.map((tier) => tier.deliveryTime)
					.filter((dt) => dt !== undefined);
				if (tierDeliveryTimes.length > 0) {
					const tierHours = tierDeliveryTimes
						.map((deliveryTime) => tierDeliveryTimeToHours(deliveryTime))
						.filter((hours): hours is number => typeof hours === 'number');
					if (tierHours.length > 0) {
						return Math.min(...tierHours);
					}
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
 * @param dTagValue - Human-readable d-tag (same format as tasks), e.g. service-{slug}-{createdAt}-{suffix}
 */
async function generateServiceTags(
	serviceData: ServiceBody,
	dTagValue: string
): Promise<string[][]> {
	const tags: string[][] = [];

	// NIP-99: d-tag unique identifier (human-readable, like tasks)
	tags.push(['d', dTagValue]);
	tags.push(['title', serviceData.title]); // NIP-99: Service title
	tags.push(['summary', serviceData.description.substring(0, 200)]); // NIP-99: Brief summary/tagline
	tags.push(['published_at', serviceData.createdAt.toString()]); // NIP-99: Publication timestamp
	tags.push(['location', getLocationDisplayName(serviceData)]); // NIP-99: Service location
	tags.push([
		'price',
		getPriceForTag(serviceData.pricing).toString(),
		serviceData.pricing.currency
	]); // NIP-99: Price array
	tags.push([TAGS.S, serviceData.status]); // NIP-99: Status (single-char for filtering)

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

	// Location types (single-char tag O for filtering)
	if (serviceData.serviceLocationTypes && serviceData.serviceLocationTypes.length > 0) {
		serviceData.serviceLocationTypes.forEach((locationType) => {
			tags.push([TAGS.O, locationType]);
		});
	}

	// Location display name (optional, for display purposes)
	const locationDisplayName = getLocationDisplayName(serviceData);
	if (locationDisplayName && locationDisplayName !== 'Remote') {
		tags.push(['location_display_name', locationDisplayName]);
	}

	// Service radius (if taskee_location / provider travels to the buyer)
	if (
		serviceData.serviceLocationTypes.includes(ServiceLocationTypeEnum.TASKEE_LOCATION) &&
		serviceData.locationDetails?.taskeeLocation?.serviceRadius
	) {
		tags.push([
			'service_radius',
			serviceData.locationDetails.taskeeLocation.serviceRadius.toString()
		]);
	}

	// Pricing type (single-char tag Y for filtering)
	tags.push([TAGS.Y, serviceData.pricing.type]);

	// Price range tags for tiered pricing (single-char I, X for filtering)
	if (serviceData.pricing.type === ServicePricingTypeEnum.TIERED && serviceData.pricing.tiers) {
		const prices = serviceData.pricing.tiers.map((t) => t.price);
		tags.push([TAGS.I, Math.min(...prices).toString(), serviceData.pricing.currency]);
		tags.push([TAGS.X, Math.max(...prices).toString(), serviceData.pricing.currency]);
	}

	// Delivery time (single-char tag U for filtering)
	const deliveryTimeHours = getDeliveryTimeInHours(serviceData.pricing);
	if (deliveryTimeHours !== undefined) {
		tags.push([TAGS.U, deliveryTimeHours.toString()]);
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

	// Emit thumb tags for video portfolio items (Cloudflare Stream auto-thumbnails)
	const portfolio = serviceData.portfolio || [];
	for (const item of portfolio) {
		if (item.cloudflareId || item.type === 'video/*') {
			const thumbUrl = item.cloudflareId
				? `https://customer-${import.meta.env.VITE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${item.cloudflareId}/thumbnails/thumbnail.jpg`
				: item.url;
			tags.push(['thumb', thumbUrl]);
		}
	}

	return tags;
}

function getCreateServiceEventKind(status: ServiceBody['status']): number {
	return status === 'active' ? KINDS.SERVICE_ACTIVE : KINDS.SERVICE_DRAFT;
}

function getUpdatedServiceEventKind(
	originalEventKind: number,
	updatedStatus: ServiceBody['status']
): number {
	if (updatedStatus === 'active') {
		return KINDS.SERVICE_ACTIVE;
	}

	// Preserve published service identity on kind 30402 when toggling inactive/sold.
	if (originalEventKind === KINDS.SERVICE_ACTIVE) {
		return KINDS.SERVICE_ACTIVE;
	}

	return KINDS.SERVICE_DRAFT;
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
			identifier: dTag,
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
 * Create a new service (creates NIP-99 event)
 */
export async function createService(serviceData: ServiceBody): Promise<string> {
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

		const createdAt = Math.floor(Date.now() / 1000);
		// Human-readable d-tag (same pattern as tasks), used as unique identifier
		const dTagValue = getReadableServiceDTag(serviceData.title, createdAt, npub);

		// Use user name if available, otherwise use shortened npub as fallback
		const username =
			userData?.name || npub.substring(0, 8) + '...' + npub.substring(npub.length - 8);

		const creator = {
			username,
			avatar: userData?.picture || ''
		};

		// Generate translations for all supported languages (BEFORE creating event)
		const translations = await generateServiceTranslations(serviceData);

		// Add metadata to service data (uniqueId = d-tag for backwards compat in content)
		const serviceDataWithMeta = {
			...serviceData,
			creator,
			createdAt,
			uniqueId: dTagValue,
			...(translations && { translations }) // Only include if translations were generated
		};

		if (serviceDataWithMeta.locationDetails?.taskeeLocation?.serviceLocation) {
			// Publish the exact companion first so public service discovery never outpaces
			// the private exact location record.
			await publishExactServiceLocation({
				entityId: dTagValue,
				taskeeLocation: serviceDataWithMeta.locationDetails.taskeeLocation.serviceLocation
			});
		}

		const publicServiceData = sanitizeServiceForPublicPublish(serviceDataWithMeta, dTagValue);

		// Determine event kind based on status
		const eventKind = getCreateServiceEventKind(publicServiceData.status);

		// Generate tags (d-tag is the human-readable identifier)
		const tags = await generateServiceTags(publicServiceData, dTagValue);

		// Create event
		const event = {
			kind: eventKind,
			created_at: Math.floor(Date.now() / 1000),
			content: JSON.stringify(publicServiceData),
			tags
		};

		// Sign and publish
		const signedEvent = await getSignedEvent(event);
		await nostrEventsService.publishEvent(signedEvent);

		queueSearchUpsert(
			'services',
			[serviceToSearchDocument({ ...publicServiceData, id: dTagValue, npub })],
			true
		);

		// Return d-tag (human-readable identifier for URLs and updates)
		return dTagValue;
	} catch (error) {
		console.error('❌ Failed to create service:', error);
		throw error;
	}
}

/**
 * Update an existing service using NIP-33 parameterized replaceable events.
 * Uses only #d tag identifier (human-readable, like tasks).
 */
export async function updateService(
	dTag: string,
	updates: Partial<ServiceBody>,
	options: {
		expectedServiceEventId?: string;
	} = {}
): Promise<string> {
	try {
		const npub = await getNpub();
		if (!npub) {
			throw new Error('User not authenticated');
		}

		// Support both npub (bech32) and raw hex public keys, like tasks/services finders
		let authorHex = npub;
		if (npub.startsWith('npub')) {
			const decoded = nip19.decode(npub);
			if (decoded.type !== 'npub') {
				throw new Error('Invalid npub');
			}
			authorHex = decoded.data as string;
		}

		const requestFilters = [
			{
				kinds: [KINDS.SERVICE_ACTIVE, KINDS.SERVICE_DRAFT],
				'#d': [dTag],
				authors: [authorHex],
				limit: 10
			}
		] as Array<Record<string, unknown>>;

		if (/^[0-9a-f]{64}$/i.test(dTag)) {
			requestFilters.push({
				kinds: [KINDS.SERVICE_ACTIVE, KINDS.SERVICE_DRAFT],
				ids: [dTag],
				authors: [authorHex],
				limit: 1
			});
		}

		const response = await nostrEventsService.requestEvents({
			filters: requestFilters
		});

		if (!response.data?.length) {
			throw new Error('Service not found');
		}
		const originalService = response.data.reduce((latest, current) =>
			current.created_at > latest.created_at ? current : latest
		);

		if (options.expectedServiceEventId && originalService.id !== options.expectedServiceEventId) {
			throw createServiceEditConflictError({
				dTag,
				expectedServiceEventId: options.expectedServiceEventId,
				latestServiceEventId: originalService.id
			});
		}

		// Parse original service data
		const originalServiceData = JSON.parse(originalService.content) as ServiceBody;

		// d-tag is the stable identifier (from tags or param)
		const dTagValue =
			originalService.tags?.find((t: string[]) => t[0] === 'd')?.[1] ??
			originalServiceData.uniqueId ??
			dTag;
		if (!dTagValue) {
			throw new Error('Original service has no d-tag');
		}

		// Check if title or description changed - if so, regenerate translations
		const needsRetranslation =
			(updates.title && updates.title !== originalServiceData.title) ||
			(updates.description && updates.description !== originalServiceData.description);

		// Create updated service data for translation (if needed)
		// Companion read failures degrade safely to null so metadata-only edits do not replace
		// the private exact location with the obfuscated public anchor.
		const exactLocation = await getExactServiceLocation(dTagValue).catch(() => null);
		const hasTaskeeLocationUpdate = Object.prototype.hasOwnProperty.call(
			updates.locationDetails?.taskeeLocation ?? {},
			'serviceLocation'
		);
		const baseServiceData: ServiceBody = {
			...originalServiceData,
			locationDetails: {
				...originalServiceData.locationDetails,
				taskerLocation:
					exactLocation?.taskerLocation && originalServiceData.locationDetails?.taskerLocation
						? {
								...originalServiceData.locationDetails.taskerLocation,
								serviceLocation: exactLocation.taskerLocation
							}
						: originalServiceData.locationDetails?.taskerLocation,
				taskeeLocation:
					exactLocation?.taskeeLocation && originalServiceData.locationDetails?.taskeeLocation
						? {
								...originalServiceData.locationDetails.taskeeLocation,
								serviceLocation: exactLocation.taskeeLocation,
								locationDisplayName:
									originalServiceData.locationDetails.taskeeLocation.locationDisplayName ??
									exactLocation.taskeeLocation.displayName
							}
						: originalServiceData.locationDetails?.taskeeLocation
			}
		};

		const serviceDataForTranslation: ServiceBody = {
			...baseServiceData,
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
		const eventKind = getUpdatedServiceEventKind(originalService.kind, updatedStatus);

		// Merge updates with original service data
		const updatedServiceData: ServiceBody = {
			...baseServiceData,
			...updates,
			uniqueId: dTagValue, // Keep same d-tag as identifier
			status: updatedStatus,
			...(translations && { translations }) // Include updated translations
		};

		if (exactLocation || hasTaskeeLocationUpdate) {
			await publishExactServiceLocation({
				entityId: dTagValue,
				taskeeLocation: hasTaskeeLocationUpdate
					? updatedServiceData.locationDetails?.taskeeLocation?.serviceLocation
					: exactLocation?.taskeeLocation
			});
		}
		const publicUpdatedServiceData = sanitizeServiceForPublicPublish(updatedServiceData, dTagValue);

		// Generate tags (same d-tag for replaceable event)
		const tags = await generateServiceTags(publicUpdatedServiceData, dTagValue);

		// Create update event using the same kind as original (or updated if status changed)
		const event = {
			kind: eventKind, // Use same kind as original, or update if status changed
			created_at: Math.floor(Date.now() / 1000), // New timestamp for replacement
			content: JSON.stringify(publicUpdatedServiceData),
			tags
		};

		// Sign and publish
		const signedEvent = await getSignedEvent(event);
		await nostrEventsService.publishEvent(signedEvent);

		queueSearchUpsert(
			'services',
			[
				serviceToSearchDocument({
					...publicUpdatedServiceData,
					id: dTagValue,
					npub: signedEvent.pubkey
				})
			],
			true
		);

		return signedEvent.id;
	} catch (error) {
		console.error('Failed to update service:', error);
		throw error;
	}
}

/**
 * Delete a service using NIP-09 deletion event (kind 5)
 * @param eventId - Nostr event ID (64-char hex) of the service event to delete
 */
export interface DeleteServiceGuardInput {
	hasOpenQuotes: boolean;
	hasActiveContracts: boolean;
}

interface DeleteServiceOptions {
	uniqueId?: string | null;
}

export function assertServiceDeletionAllowed(guard: DeleteServiceGuardInput): void {
	if (guard.hasActiveContracts) {
		throw new Error('Cannot delete a service with active contracts.');
	}
}

async function resolveDeleteTargetEventIds(
	eventId: string,
	options: DeleteServiceOptions = {}
): Promise<string[]> {
	const uniqueId = options.uniqueId?.trim();
	if (!uniqueId) {
		return [eventId];
	}

	try {
		const npub = await getNpub();
		if (!npub) {
			return [eventId];
		}

		let authorHex = npub;
		if (npub.startsWith('npub')) {
			const decoded = nip19.decode(npub);
			if (decoded.type !== 'npub') {
				return [eventId];
			}
			authorHex = decoded.data as string;
		}

		const response = await nostrEventsService.requestEvents({
			filters: [
				{
					kinds: [KINDS.SERVICE_ACTIVE, KINDS.SERVICE_DRAFT],
					'#d': [uniqueId],
					authors: [authorHex],
					limit: 20
				}
			]
		});

		const resolvedIds = response.data?.map((event) => event.id) ?? [];
		return Array.from(new Set([eventId, ...resolvedIds]));
	} catch (error) {
		console.error('Failed to resolve all service versions before delete:', error);
		return [eventId];
	}
}

export async function deleteService(
	eventId: string,
	guard: DeleteServiceGuardInput,
	options: DeleteServiceOptions = {}
): Promise<string> {
	try {
		assertServiceDeletionAllowed(guard);
		const targetEventIds = await resolveDeleteTargetEventIds(eventId, options);

		const event = {
			kind: 5, // NIP-09 deletion event
			created_at: Math.floor(Date.now() / 1000),
			content: 'Service deleted',
			tags: targetEventIds.map((targetEventId) => ['e', targetEventId]) // Delete every known version of the same service identity.
		};

		// Sign and publish
		const signedEvent = await getSignedEvent(event);
		const response = await nostrEventsService.deleteEvent(signedEvent);
		if (response.deleteCount === 0) {
			throw new Error('Failed to delete service');
		}
		queueSearchDelete('services', [options.uniqueId || eventId]);
		return response.message;
	} catch (error) {
		console.error('Failed to delete service:', error);
		throw error;
	}
}

/**
 * Find service by d-tag (human-readable identifier, same as tasks)
 * Queries by #d tag filter.
 */
export async function findServiceByUniqueId(dTag: string): Promise<Service | null> {
	try {
		const filter = {
			kinds: [KINDS.SERVICE_ACTIVE, KINDS.SERVICE_DRAFT],
			'#d': [dTag],
			limit: 10
		};

		const response = await nostrEventsService.requestEvents({
			filters: [filter]
		});

		if (response.data?.length) {
			const latestEvent = response.data.reduce((latest, current) =>
				current.created_at > latest.created_at ? current : latest
			);

			const deletionResponse = await nostrEventsService.requestEvents({
				filters: [
					{
						kinds: [5],
						'#e': [latestEvent.id],
						limit: 20
					}
				]
			});

			if (
				deletionResponse.data?.some((event) =>
					event.tags.some((tag) => tag[0] === 'e' && tag[1] === latestEvent.id)
				)
			) {
				return null;
			}

			// Parse service data
			const contentData = normalizeServiceTierDeliveryTimes(
				JSON.parse(latestEvent.content) as ServiceBody
			);
			const service: Service = {
				...contentData,
				id: latestEvent.id,
				npub: latestEvent.pubkey,
				eventKind: latestEvent.kind
			};

			return service;
		}

		return null;
	} catch (error) {
		console.error('Error finding service by uniqueId:', error);
		return null;
	}
}

// Export helper functions for use in other modules
export { generateServiceTags, generateServiceNaddr, generateServiceTranslations };
