import type { Service, ServiceTier, AddOn, ServiceFAQ } from '$lib/types/service.d';

/**
 * Get the display title for a service in the given locale.
 * Uses service.translations when the requested locale differs from sourceLanguage.
 */
export function getServiceDisplayTitle(service: Service, locale: string): string {
	if (!service.translations?.translations || service.translations.sourceLanguage === locale) {
		return service.title ?? '';
	}
	const t = service.translations.translations[locale];
	return (t?.title ?? service.title) || '';
}

/**
 * Get the display description for a service in the given locale.
 */
export function getServiceDisplayDescription(service: Service, locale: string): string {
	if (!service.translations?.translations || service.translations.sourceLanguage === locale) {
		return service.description ?? '';
	}
	const t = service.translations.translations[locale];
	return (t?.description ?? service.description) || '';
}

/**
 * Get tiers with translated name, description, features, and delivery times when available.
 */
export function getServiceDisplayTiers(service: Service, locale: string): ServiceTier[] {
	const tiers = service.pricing?.tiers ?? [];
	if (!tiers.length) return [];

	if (!service.translations?.translations || service.translations.sourceLanguage === locale) {
		return tiers;
	}

	const translated = service.translations.translations[locale];
	const translatedTiers = translated?.tiers ?? [];

	return tiers.map((tier) => {
		const tr = translatedTiers.find((tt) => tt.id === tier.id);
		if (!tr) return tier;
		return {
			...tier,
			name: tr.name ?? tier.name,
			description: tr.description ?? tier.description,
			features: Array.isArray(tr.features) && tr.features.length > 0 ? tr.features : tier.features,
			...(tr.deliveryTime?.display != null
				? {
						deliveryTime: {
							...(tier.deliveryTime ?? { value: 0, unit: 'day', display: '' }),
							display: tr.deliveryTime.display
						}
					}
				: {}),
			...(tr.rushDelivery?.deliveryTime?.display != null && tier.rushDelivery
				? {
						rushDelivery: {
							...tier.rushDelivery,
							deliveryTime: {
								...tier.rushDelivery.deliveryTime,
								display: tr.rushDelivery.deliveryTime.display
							}
						}
					}
				: {})
		};
	});
}

/**
 * Get add-ons with translated name and description when available.
 */
export function getServiceDisplayAddOns(service: Service, locale: string): AddOn[] {
	const addOns = service.pricing?.addOns ?? [];
	if (!addOns.length) return [];

	if (!service.translations?.translations || service.translations.sourceLanguage === locale) {
		return addOns;
	}

	const translated = service.translations.translations[locale];
	const translatedAddOns = translated?.addOns ?? [];

	return addOns.map((addOn) => {
		const tr = translatedAddOns.find((ta) => ta.id === addOn.id);
		if (!tr) return addOn;
		return {
			...addOn,
			name: tr.name ?? addOn.name,
			...(tr.description != null ? { description: tr.description } : {})
		};
	});
}

/**
 * Get FAQs with translated question and answer when available.
 */
export function getServiceDisplayFaqs(service: Service, locale: string): ServiceFAQ[] {
	const faqs = service.faqs ?? [];
	if (!faqs.length) return [];

	if (!service.translations?.translations || service.translations.sourceLanguage === locale) {
		return faqs;
	}

	const translated = service.translations.translations[locale];
	const translatedFaqs = translated?.faqs ?? [];

	return faqs.map((faq) => {
		const tr = translatedFaqs.find((tf) => tf.id === faq.id);
		if (!tr) return faq;
		return {
			...faq,
			question: tr.question ?? faq.question,
			answer: tr.answer ?? faq.answer
		};
	});
}

/**
 * Get the main pricing delivery time display string in the given locale (for fixed/hourly).
 */
export function getServiceDeliveryTimeDisplay(
	service: Service,
	locale: string
): string | undefined {
	const display = service.pricing?.deliveryTime?.display;
	if (!display) return undefined;

	if (!service.translations?.translations || service.translations.sourceLanguage === locale) {
		return display;
	}
	const t = service.translations.translations[locale];
	return t?.deliveryTime?.display ?? display;
}

/**
 * Get the rush delivery time display string in the given locale.
 */
export function getServiceRushDeliveryDisplay(
	service: Service,
	locale: string
): string | undefined {
	const display = service.pricing?.rushDelivery?.deliveryTime?.display;
	if (!display) return undefined;

	if (!service.translations?.translations || service.translations.sourceLanguage === locale) {
		return display;
	}
	const t = service.translations.translations[locale];
	return t?.rushDelivery?.deliveryTime?.display ?? display;
}
