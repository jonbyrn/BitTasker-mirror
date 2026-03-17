import type { PageLoad } from './$types';
import type { Service } from '$lib/types/service.d';
import { findServiceByUniqueId } from '$lib/nostr/service';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { BITTASKER_CANONICAL_BASE } from '$lib/utils/constants/seo.constants';

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

function buildServiceDescription(service: Service): string {
	if (!service.description) {
		return 'No description available';
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

function getServiceAreaServed(service: Service): string | undefined {
	if (!service.serviceLocationTypes?.length) {
		return undefined;
	}

	if (service.serviceLocationTypes.includes(ServiceLocationTypeEnum.REMOTE)) {
		return 'Remote';
	}

	if (service.serviceLocationTypes.includes(ServiceLocationTypeEnum.TASKER_LOCATION)) {
		return (
			service.locationDetails?.taskerLocation?.serviceLocation?.displayName ||
			service.locationDetails?.taskerLocation?.serviceLocation?.formattedAddress ||
			'At provider location'
		);
	}

	if (service.serviceLocationTypes.includes(ServiceLocationTypeEnum.TASKEE_LOCATION)) {
		return (
			service.locationDetails?.taskeeLocation?.locationDisplayName ||
			service.locationDetails?.taskeeLocation?.serviceLocation?.displayName ||
			service.locationDetails?.taskeeLocation?.serviceLocation?.formattedAddress ||
			'Travels to you'
		);
	}

	return undefined;
}

function generateServiceJsonLd(service: Service, canonicalUrl: string) {
	const offer = getServiceOffer(service);
	const areaServed = getServiceAreaServed(service);
	const image = getServiceImage(service);
	const providerName = service.creator?.username || 'BitTasker provider';

	return {
		'@context': 'https://schema.org',
		'@type': 'Service',
		'@id': `${canonicalUrl}#service`,
		name: service.title || 'Untitled Service',
		description: buildServiceDescription(service),
		url: canonicalUrl,
		mainEntityOfPage: canonicalUrl,
		image,
		serviceType: service.categories?.[0]?.name || 'Professional service',
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

function buildDefaultSeo(canonicalUrl: string): ServiceSeoPayload {
	const title = 'Service Details - BitTasker';
	const description =
		'View service details on BitTasker, the Bitcoin-powered task and service marketplace.';
	const image = `${baseUrl}/images/og-task-default.jpg`;

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
		ogImageAlt: 'BitTasker service preview',
		twitterCard: 'summary_large_image',
		twitterTitle: title,
		twitterDescription: description,
		twitterImage: image,
		twitterImageAlt: 'BitTasker service preview',
		jsonLd: null
	};
}

export const load: PageLoad = async ({ params }) => {
	const requestedServiceId = normalizeServiceId(params.serviceId, params.serviceId);
	const service: Service | null = await findServiceByUniqueId(requestedServiceId);
	const canonicalId = normalizeServiceId(service?.uniqueId, requestedServiceId);
	const canonicalUrl = buildCanonicalUrl(canonicalId);
	const seo = buildDefaultSeo(canonicalUrl);

	if (service) {
		const title = service.title || 'Untitled Service';
		const desc = buildServiceDescription(service);
		const image = getServiceImage(service);
		const titleWithSite = `${title} - BitTasker`;
		const imageAlt = `${title} service preview`;

		seo.title = titleWithSite;
		seo.description = desc;
		seo.keywords = buildServiceKeywords(service);
		seo.robots =
			service.status === 'active'
				? 'index, follow, max-image-preview:large'
				: 'noindex, follow';
		seo.ogTitle = titleWithSite;
		seo.ogDescription = desc;
		seo.ogImage = image;
		seo.ogImageAlt = imageAlt;
		seo.twitterTitle = titleWithSite;
		seo.twitterDescription = desc;
		seo.twitterImage = image;
		seo.twitterImageAlt = imageAlt;
		seo.jsonLd = generateServiceJsonLd(service, canonicalUrl);

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
