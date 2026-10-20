import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createServiceAliasPath } from '$lib/utils/service/listing';
import type { Service } from '$lib/types/service.d';
import { findServiceByUniqueId } from '$lib/nostr/service';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { BITTASKER_CANONICAL_BASE } from '$lib/utils/constants/seo.constants';
import { loadNamespace, type SupportedLanguage } from '$lib/i18n/i18n';
import { locale, t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

const baseUrl = BITTASKER_CANONICAL_BASE.replace(/\/$/, '');

export const prerender = false;

type ServiceSeoPayload = {
	title: string;
	description: string;
	keywords: string;
	canonical: string;
	robots: string;
	ogType: 'website';
	ogTitle: string;
	ogDescription: string;
	ogImage: string;
	ogImageAlt: string;
	twitterCard: 'summary_large_image';
	twitterTitle: string;
	twitterDescription: string;
	twitterImage: string;
	twitterImageAlt: string;
	jsonLd: Record<string, unknown> | null;
};

type Translate = (
	key: string,
	fallback: string,
	values?: Record<string, string | number>
) => string;

function normalizeServiceId(serviceId: string | null | undefined, fallback: string): string {
	const trimmed = serviceId?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function buildCanonicalUrl(serviceId: string): string {
	return `${baseUrl}/services/${encodeURIComponent(serviceId)}`;
}

function toAbsoluteUrl(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	try {
		return new URL(value, `${baseUrl}/`).toString();
	} catch {
		return null;
	}
}

function applyValues(template: string, values?: Record<string, string | number>): string {
	if (!values) {
		return template;
	}

	return Object.entries(values).reduce(
		(result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
		template
	);
}

function createTranslator(): Translate {
	const translate = get(t);

	return (key, fallback, values) => {
		try {
			const value = translate(key, values ? { values } : undefined);
			return typeof value === 'string' && value !== key ? value : applyValues(fallback, values);
		} catch {
			return applyValues(fallback, values);
		}
	};
}

function buildServiceDescription(service: Service, tr: Translate): string {
	if (!service.description) {
		return tr('dashboard.services.detail.seo.no_description_available', 'No description available');
	}

	const normalized = service.description.replace(/\s+/g, ' ').trim();
	return normalized.length > 157 ? `${normalized.slice(0, 157)}...` : normalized;
}

function getServiceImage(service: Service): string {
	const firstImage = service.portfolio?.find(
		(attachment) => attachment.url && !/\.(mp4|webm|ogg|mov)$/i.test(attachment.url)
	);

	return toAbsoluteUrl(firstImage?.url) || `${baseUrl}/images/og-task-default.jpg`;
}

function getServiceOffer(service: Service) {
	const pricing = service.pricing;
	if (!pricing) {
		return null;
	}

	switch (pricing.type) {
		case ServicePricingTypeEnum.FIXED:
			return typeof pricing.amount === 'number'
				? {
						'@type': 'Offer' as const,
						priceCurrency: pricing.currency || 'USD',
						price: pricing.amount,
						availability: 'https://schema.org/InStock'
					}
				: null;
		case ServicePricingTypeEnum.HOURLY:
			return typeof pricing.hourlyRate === 'number'
				? {
						'@type': 'Offer' as const,
						priceCurrency: pricing.currency || 'USD',
						price: pricing.hourlyRate,
						availability: 'https://schema.org/InStock',
						priceSpecification: {
							'@type': 'UnitPriceSpecification' as const,
							priceCurrency: pricing.currency || 'USD',
							price: pricing.hourlyRate,
							unitText: 'HUR'
						}
					}
				: null;
		case ServicePricingTypeEnum.TIERED: {
			const tierPrices = pricing.tiers
				?.map((tier) => tier.price)
				.filter((price): price is number => typeof price === 'number' && price > 0);

			return tierPrices?.length
				? {
						'@type': 'AggregateOffer' as const,
						priceCurrency: pricing.currency || 'USD',
						lowPrice: Math.min(...tierPrices),
						highPrice: Math.max(...tierPrices),
						offerCount: tierPrices.length,
						availability: 'https://schema.org/InStock'
					}
				: null;
		}
		default:
			return null;
	}
}

function getServiceAreaServed(service: Service, tr: Translate): string | undefined {
	if (!service.serviceLocationTypes?.length) {
		return undefined;
	}

	if (service.serviceLocationTypes.includes(ServiceLocationTypeEnum.REMOTE)) {
		return tr('dashboard.services.detail.location.remote', 'Remote');
	}

	if (service.serviceLocationTypes.includes(ServiceLocationTypeEnum.TASKER_LOCATION)) {
		return (
			service.locationDetails?.taskerLocation?.serviceLocation?.displayName ||
			service.locationDetails?.taskerLocation?.serviceLocation?.formattedAddress ||
			tr('dashboard.services.detail.seo.at_provider_location', 'At provider location')
		);
	}

	if (service.serviceLocationTypes.includes(ServiceLocationTypeEnum.TASKEE_LOCATION)) {
		return (
			service.locationDetails?.taskeeLocation?.locationDisplayName ||
			service.locationDetails?.taskeeLocation?.serviceLocation?.displayName ||
			service.locationDetails?.taskeeLocation?.serviceLocation?.formattedAddress ||
			tr('dashboard.services.detail.seo.travels_to_you', 'Travels to you')
		);
	}

	return undefined;
}

function generateServiceJsonLd(service: Service, canonicalUrl: string, tr: Translate) {
	const offer = getServiceOffer(service);
	const areaServed = getServiceAreaServed(service, tr);
	const image = getServiceImage(service);
	const providerName =
		service.creator?.username ||
		tr('dashboard.services.detail.seo.provider_fallback', 'BitTasker provider');

	return {
		'@context': 'https://schema.org',
		'@type': 'Service',
		'@id': `${canonicalUrl}#service`,
		name: service.title || tr('dashboard.services.detail.seo.untitled_service', 'Untitled Service'),
		description: buildServiceDescription(service, tr),
		url: canonicalUrl,
		mainEntityOfPage: canonicalUrl,
		image,
		serviceType:
			service.categories?.[0]?.name ||
			tr('dashboard.services.detail.seo.professional_service', 'Professional service'),
		provider: {
			'@type': 'Organization',
			name: providerName
		},
		...(offer ? { offers: offer } : {}),
		...(areaServed ? { areaServed } : {})
	};
}

function buildServiceKeywords(service: Service | null): string {
	if (!service) {
		return 'bitcoin services, freelance, gig economy, service marketplace, bitcoin payments';
	}

	const keywordSet = new Set<string>([
		'bitcoin services',
		'service marketplace',
		'freelance services',
		service.title,
		...(service.skills ?? []),
		...(service.categories?.map((category) => category.name) ?? [])
	]);

	return Array.from(keywordSet)
		.map((value) => value?.trim())
		.filter((value): value is string => Boolean(value))
		.join(', ');
}

function buildDefaultSeo(canonicalUrl: string, tr: Translate): ServiceSeoPayload {
	const title = tr('dashboard.services.detail.seo.page_title', 'Service Details - BitTasker');
	const description = tr(
		'dashboard.services.detail.seo.page_description',
		'View service details on BitTasker, the Bitcoin-powered task and service marketplace.'
	);
	const image = `${baseUrl}/images/og-task-default.jpg`;
	const imageAlt = tr('dashboard.services.detail.seo.image_alt', '{title} service preview', {
		title: 'BitTasker'
	});

	return {
		title,
		description,
		keywords: buildServiceKeywords(null),
		canonical: canonicalUrl,
		robots: 'noindex, follow',
		ogType: 'website',
		ogTitle: title,
		ogDescription: description,
		ogImage: image,
		ogImageAlt: imageAlt,
		twitterCard: 'summary_large_image',
		twitterTitle: title,
		twitterDescription: description,
		twitterImage: image,
		twitterImageAlt: imageAlt,
		jsonLd: null
	};
}

export const load: PageLoad = async ({ params, parent }) => {
	const alias = createServiceAliasPath(params.serviceId);
	if (alias) redirect(307, alias);

	const currentLocale = (get(locale) as SupportedLanguage) || 'en';
	if (browser) {
		await loadNamespace(currentLocale, 'dashboard/services/detail');
	}

	const parentData = await parent();
	const existingService = (parentData as Record<string, unknown>)?.service as
		| Service
		| null
		| undefined;

	const tr = createTranslator();
	const requestedServiceId = normalizeServiceId(params.serviceId, params.serviceId);

	let service: Service | null = null;
	try {
		service = await findServiceByUniqueId(requestedServiceId);
	} catch (error) {
		console.warn('[ServiceDetail] Failed to fetch service, keeping existing data:', error);
		service = existingService ?? null;
	}

	const canonicalId = normalizeServiceId(service?.uniqueId, requestedServiceId);
	const canonicalUrl = buildCanonicalUrl(canonicalId);
	const seo = buildDefaultSeo(canonicalUrl, tr);

	if (service) {
		const title =
			service.title || tr('dashboard.services.detail.seo.untitled_service', 'Untitled Service');
		const desc = buildServiceDescription(service, tr);
		const image = getServiceImage(service);
		const titleWithSite = `${title} - BitTasker`;
		const imageAlt = tr('dashboard.services.detail.seo.image_alt', '{title} service preview', {
			title
		});

		seo.title = titleWithSite;
		seo.description = desc;
		seo.keywords = buildServiceKeywords(service);
		seo.robots =
			service.status === 'active' ? 'index, follow, max-image-preview:large' : 'noindex, follow';
		seo.ogTitle = titleWithSite;
		seo.ogDescription = desc;
		seo.ogImage = image;
		seo.ogImageAlt = imageAlt;
		seo.twitterTitle = titleWithSite;
		seo.twitterDescription = desc;
		seo.twitterImage = image;
		seo.twitterImageAlt = imageAlt;
		seo.jsonLd = generateServiceJsonLd(service, canonicalUrl, tr);

		return {
			service,
			serviceId: canonicalId,
			seo
		};
	}

	return {
		service: null,
		serviceId: canonicalId,
		seo
	};
};
