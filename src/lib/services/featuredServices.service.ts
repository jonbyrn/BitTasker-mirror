import type { Service, ServiceTier } from '$lib/types/service.d';
import { findServices } from '$lib/nostr/findServices';
import {
	FEATURED_HOMEPAGE_LIMIT,
	clearFeaturedHomepageCache,
	getFirstImageUrl,
	hasImageAttachment,
	loadFeaturedHomepageItems
} from '$lib/services/featuredHomepage';
import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
import {
	getServiceDeliveryTimeDisplay,
	getServiceDisplayDescription,
	getServiceDisplayTitle
} from '$lib/utils/serviceDisplayTranslation';
import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
import { isFeaturedPlaceholder } from '$lib/services/featuredTestListing';

export interface FeaturedService {
	id: string;
	href: string;
	title: string;
	description: string;
	priceLabel: string;
	location?: string;
	meta: string[];
	image: string;
	imageAlt: string;
	ctaLabel: string;
}

/**
 * Result type for featured services fetch - allows UI to distinguish between
 * "no services available" and "fetch failed"
 */
export interface FeaturedServicesResult {
	success: boolean;
	services: FeaturedService[];
	error?: string;
}

export interface FeaturedServiceLabels {
	untitledServiceLabel: string;
	noDescriptionLabel: string;
	requestQuoteLabel: string;
	serviceListingLabel: string;
	remoteLabel: string;
	atProviderLocationLabel: string;
	travelsToYouLabel: string;
	viewServiceLabel: string;
}

const DEFAULT_FEATURED_SERVICE_LABELS: FeaturedServiceLabels = {
	untitledServiceLabel: 'Untitled service',
	noDescriptionLabel: 'No description available.',
	requestQuoteLabel: 'Request Quote',
	serviceListingLabel: 'Service listing',
	remoteLabel: 'Remote',
	atProviderLocationLabel: 'At provider location',
	travelsToYouLabel: 'Travels to you',
	viewServiceLabel: 'View Service'
};

const FEATURED_SERVICES_CACHE_KEY = 'homepage:featured-services';
const FEATURED_SERVICES_FETCH_LIMIT = 24;

function getHomepageServiceIdentity(service: Service): string {
	return service.uniqueId?.trim() || service.id;
}

function isHomepageEligibleService(service: Service): boolean {
	return (
		service.status === 'active' &&
		!service.isDeleted &&
		!service.deletedAt &&
		Boolean(getHomepageServiceIdentity(service)) &&
		!isFeaturedPlaceholder({
			title: service.title,
			description: service.description,
			image: getFirstImageUrl(service.portfolio)
		})
	);
}

function resolveFeaturedServiceLabels(
	overrides: Partial<FeaturedServiceLabels> = {}
): FeaturedServiceLabels {
	return {
		...DEFAULT_FEATURED_SERVICE_LABELS,
		...overrides
	};
}

export class FeaturedServicesService {
	/** Loads homepage featured services using localized display labels and canonical-safe service hrefs. */
	static async getFeaturedServices(
		limit: number = FEATURED_HOMEPAGE_LIMIT,
		options: {
			locale?: string;
			labels?: Partial<FeaturedServiceLabels>;
		} = {}
	): Promise<FeaturedServicesResult> {
		const locale = options.locale || 'en';
		const labels = resolveFeaturedServiceLabels(options.labels);

		try {
			const featuredServices = await loadFeaturedHomepageItems<Service>({
				cacheKey: FEATURED_SERVICES_CACHE_KEY,
				limit,
				getId: getHomepageServiceIdentity,
				sorter: (left, right) => {
					const imageScore =
						Number(hasImageAttachment(right.portfolio)) -
						Number(hasImageAttachment(left.portfolio));
					if (imageScore !== 0) {
						return imageScore;
					}

					return (right.createdAt ?? 0) - (left.createdAt ?? 0);
				},
				fetcher: async () => {
					const { services } = await findServices({
						limit: FEATURED_SERVICES_FETCH_LIMIT,
						page: 1,
						sortBy: 'date'
					});

					return services.filter(isHomepageEligibleService);
				}
			});

			return {
				success: true,
				services: featuredServices.map((service) =>
					this.convertToFeaturedService(service, locale, labels)
				)
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Failed to fetch featured services';
			console.error('Error fetching featured services:', error);
			return {
				success: false,
				services: [],
				error: errorMessage
			};
		}
	}

	static clearCache(): void {
		clearFeaturedHomepageCache(FEATURED_SERVICES_CACHE_KEY);
	}

	private static convertToFeaturedService(
		service: Service,
		locale: string,
		labels: FeaturedServiceLabels
	): FeaturedService {
		const title =
			getServiceDisplayTitle(service, locale) || service.title || labels.untitledServiceLabel;
		const description =
			getServiceDisplayDescription(service, locale) ||
			service.description ||
			labels.noDescriptionLabel;
		const serviceIdentity = getHomepageServiceIdentity(service);

		const location = this.getLocationLabel(service, labels);

		return {
			id: service.id,
			href: `/services/${encodeURIComponent(serviceIdentity)}`,
			title,
			description,
			priceLabel: this.getPriceLabel(service, labels),
			location: location || undefined,
			meta: this.getMeta(service, locale, labels),
			image: getFirstImageUrl(service.portfolio),
			imageAlt: title,
			ctaLabel: labels.viewServiceLabel
		};
	}

	private static getPriceLabel(service: Service, labels: FeaturedServiceLabels): string {
		const pricing = service.pricing;
		if (!pricing) {
			return labels.requestQuoteLabel;
		}

		switch (pricing.type) {
			case ServicePricingTypeEnum.FIXED:
				return pricing.amount
					? `$${formatNumberWithTwoDecimals(pricing.amount)}`
					: labels.requestQuoteLabel;
			case ServicePricingTypeEnum.HOURLY:
				return pricing.hourlyRate
					? `$${formatNumberWithTwoDecimals(pricing.hourlyRate)}/hr`
					: labels.requestQuoteLabel;
			case ServicePricingTypeEnum.TIERED: {
				const prices = pricing.tiers
					?.map((tier: ServiceTier) => tier.price)
					.filter((price): price is number => typeof price === 'number' && price > 0);
				return prices?.length
					? `From $${formatNumberWithTwoDecimals(Math.min(...prices))}`
					: labels.requestQuoteLabel;
			}
			case ServicePricingTypeEnum.INQUIRY_REQUIRED:
			default:
				return labels.requestQuoteLabel;
		}
	}

	private static getMeta(
		service: Service,
		locale: string,
		_labels: FeaturedServiceLabels
	): string[] {
		const meta: string[] = [];
		const deliveryLabel = getServiceDeliveryTimeDisplay(service, locale);

		if (deliveryLabel) {
			meta.push(deliveryLabel);
		}

		return meta;
	}

	private static getLocationLabel(service: Service, labels: FeaturedServiceLabels): string {
		if (!service.serviceLocationTypes?.length) {
			return '';
		}

		if (service.serviceLocationTypes.includes(ServiceLocationTypeEnum.REMOTE)) {
			return labels.remoteLabel;
		}

		if (service.serviceLocationTypes.includes(ServiceLocationTypeEnum.TASKER_LOCATION)) {
			return (
				service.locationDetails?.taskerLocation?.serviceLocation?.displayName ||
				service.locationDetails?.taskerLocation?.serviceLocation?.formattedAddress ||
				labels.atProviderLocationLabel
			);
		}

		if (service.serviceLocationTypes.includes(ServiceLocationTypeEnum.TASKEE_LOCATION)) {
			return (
				service.locationDetails?.taskeeLocation?.locationDisplayName ||
				service.locationDetails?.taskeeLocation?.serviceLocation?.displayName ||
				service.locationDetails?.taskeeLocation?.serviceLocation?.formattedAddress ||
				labels.travelsToYouLabel
			);
		}

		return '';
	}
}
