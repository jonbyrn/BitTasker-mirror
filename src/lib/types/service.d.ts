import type { Event as NostrEvent } from 'nostr-tools';
import type { Category, Location, Attachment } from './task.d';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

/**
 * Service Location Types
 * Multiple select location types for services
 */
export type ServiceLocationType = ServiceLocationTypeEnum;

/**
 * Service Status
 * `inactive` is used for hidden listings and local drafts in BitTasker.
 */
export type ServiceStatus = 'active' | 'inactive' | 'sold';

/**
 * Service Pricing Type
 */
export type ServicePricingType = ServicePricingTypeEnum;

/**
 * Delivery Time Interface
 * Represents delivery time/turnaround time for services
 */
export interface DeliveryTime {
	min: number; // Minimum delivery time value (e.g., 3)
	max: number; // Maximum delivery time value (e.g., 5)
	unit: 'minute' | 'hour' | 'day' | 'week' | 'month'; // Time unit
	display: string; // Human-readable display (e.g., "3-5 days", "2-3 weeks")
}

/**
 * Tier Delivery Time Interface
 * Represents a single turnaround value for service tiers and rush options
 */
export interface TierDeliveryTime {
	value: number;
	unit: 'minute' | 'hour' | 'day' | 'week' | 'month';
	display: string;
}

/**
 * Rush Delivery Interface
 * Dedicated rush delivery option with fixed amount and required rush delivery time range
 */
export interface RushDelivery {
	enabled: boolean; // Whether rush delivery is available
	price: number; // Fixed amount for rush delivery
	deliveryTime: TierDeliveryTime; // Required: Rush delivery turnaround (e.g., "2 days")
}

/**
 * Service Tier Interface
 * Represents a service tier in tiered pricing (like Fiverr packages)
 */
export interface ServiceTier {
	id: string;
	name: string; // e.g., "Basic", "Standard", "Premium"
	description: string;
	price: number;
	deliveryTime?: TierDeliveryTime; // Delivery time/turnaround time for this tier (optional)
	rushDelivery?: RushDelivery; // Dedicated rush delivery option for this tier (optional)
	features: string[]; // List of features included in this tier (bullet points)
	isPopular?: boolean; // Highlight as popular/recommended
}

/**
 * Add-On Interface
 * Simple optional extras with fixed prices (like Fiverr extras)
 */
export interface AddOn {
	id: string;
	name: string; // e.g., "Rush delivery", "Extra revisions", "Source files included"
	description?: string;
	price: number; // Fixed price for this add-on (not an adjustment)
}

/**
 * Inquiry Form Field Interface
 * Customizable inquiry form field for inquiry-based pricing
 */
export interface InquiryFormField {
	id: string;
	type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date' | 'time';
	label: string;
	placeholder?: string;
	required: boolean;
	options?: string[]; // For select/checkbox types
	validation?: {
		min?: number;
		max?: number;
		pattern?: string;
	};
}

/**
 * Inquiry Form Interface
 * Customizable inquiry form for services requiring quotes
 * Note: Photo upload and message field are always available (not configurable by taskee)
 */
export interface InquiryForm {
	fields: InquiryFormField[];
}

/**
 * Location snapshot for quote requests when service requires TASKER_LOCATION
 */
export interface QuoteRequestLocationSnapshot {
	mode: 'tasker_location';
	label: string;
	location: Location;
}

/**
 * Payload when a Tasker requests a quote for a service (solicitar cotización).
 * Order in UI: title, description, custom form (if any), images.
 */
export interface QuoteRequestPayload {
	title: string;
	description: string;
	tierId?: string;
	selectedAddOns?: string[];
	rushDelivery?: boolean;
	quoteAmountUsdt?: string;
	/** Responses keyed by inquiry form field id; only present when service has inquiryForm.fields */
	customFormResponses?: Record<string, string | number | boolean | string[]>;
	/** Optional images; same shape as task attachments */
	attachments?: Attachment[];
	/** Service location for TASKER_LOCATION services - where the Tasker wants service performed */
	serviceLocation?: QuoteRequestLocationSnapshot;
}

/**
 * Service Location Details Interface
 * Location-specific configurations for services
 */
export interface ServiceLocationDetails {
	// For TASKER_LOCATION offer mode ("At Tasker Location").
	// The provider travels to the buyer's location. This stores the provider's base location
	// for calculating travel distance/charges.
	taskerLocation?: {
		serviceLocation: Location; // Provider's base location for travel calculations
		serviceRadius?: number; // Legacy radius retained for older listings
		perDistanceCharge?: {
			amount: number;
			currency: string; // 'BTC' | 'USDt'
			unit: 'km' | 'mile'; // Distance unit
		};
	};

	// For TASKEE_LOCATION offer mode ("At My Location").
	// The buyer travels to the provider's fixed location.
	taskeeLocation?: {
		useGlobalLocation: boolean; // Deprecated transitional flag while global location is phased out
		serviceLocation?: Location; // Preferred explicit location for discovery/filtering/search radius checks
		locationDisplayName?: string; // Human-readable location name for display
		serviceRadius?: number; // Travel radius in km
		perDistanceCharge?: {
			amount: number;
			currency: string; // 'BTC' | 'USDt'
			unit: 'km' | 'mile'; // Distance unit
		};
	};
	// Discovery rule: match results using explicit taskee/freelancer service coordinates
	// (and serviceRadius where applicable), not profile-level global location.
}

/**
 * Service Pricing Interface
 * Comprehensive pricing model for services
 */
export interface ServicePricing {
	type: ServicePricingTypeEnum;
	currency: string; // 'BTC' | 'USDt'

	// For FIXED pricing
	amount?: number;
	deliveryTime?: DeliveryTime; // Delivery time/turnaround time for fixed pricing
	rushDelivery?: RushDelivery; // Dedicated rush delivery option (fixed amount, required rush delivery time range)

	// For HOURLY pricing
	hourlyRate?: number;
	estimatedHours?: number; // Optional estimate
	// deliveryTime and rushDelivery can also be used for hourly pricing

	// For TIERED pricing (2-4 tiers recommended, like Fiverr packages)
	tiers?: ServiceTier[];

	// For INQUIRY_REQUIRED pricing
	inquiryForm?: InquiryForm;

	// Simple add-ons/extras (available for all pricing types except INQUIRY_REQUIRED)
	// Like Fiverr extras - simple optional add-ons with fixed prices
	addOns?: AddOn[];
}

/**
 * Service FAQ Interface
 * Frequently asked questions for services
 */
export interface ServiceFAQ {
	id: string;
	question: string; // FAQ question
	answer: string; // FAQ answer
}

/**
 * Service Translations Interface
 * Translations for all supported languages
 */
export interface ServiceTranslations {
	sourceLanguage: string; // Language of the original content ('en' | 'es')
	translations: {
		[language: string]: {
			// 'en' | 'es'
			title: string;
			description: string;
			tiers?: Array<{
				id: string;
				name: string;
				description: string;
				features: string[]; // Translated feature list
				deliveryTime?: {
					display: string; // Translated delivery time display string
				};
				rushDelivery?: {
					deliveryTime: {
						display: string; // Translated rush delivery time display string
					};
				};
			}>;
			addOns?: Array<{
				id: string;
				name: string;
				description?: string;
			}>;
			faqs?: Array<{
				id: string;
				question: string;
				answer: string;
			}>;
			deliveryTime?: {
				display: string; // Translated delivery time display string
			};
			rushDelivery?: {
				deliveryTime: {
					display: string; // Translated rush delivery time display string
				};
			};
		};
	};
}

/**
 * ServiceBody Interface
 * Represents user input / form data / what goes in event.content (JSON stringified)
 * Used as input for createService() and updateService() functions
 * Used in service store to hold form data as user fills it out
 * Difference from Service: ServiceBody excludes event metadata (id, npub) which comes from the Nostr event itself
 */
export interface ServiceBody {
	title: string;
	description: string;
	serviceLocationTypes: ServiceLocationTypeEnum[]; // Multiple select location types
	locationDetails?: ServiceLocationDetails;
	pricing: ServicePricing; // Includes tiers, simple add-ons, inquiry forms, delivery times
	instantBuyLeadHours?: number; // Optional lead time for instant-buy listings (hours)
	instantBuyDeliveryHours?: number; // Optional delivery time for instant-buy fixed pricing (hours)
	providerWalletAddress?: string; // Provider RGB wallet used for Book Now / service contracts
	escrowInvoice?: string; // Blank RGB invoice the buyer attaches before Pay
	skills: string[];
	categories: Category[];
	/** Search taxonomy id, chosen on create. Older services omit this. */
	searchCategory?: string;
	/** Search subcategory id, chosen on create. */
	searchSubcategory?: string;
	portfolio?: Attachment[]; // Portfolio items stored via direct file uploads
	faqs?: ServiceFAQ[]; // Frequently asked questions (optional)
	status: ServiceStatus; // Listing lifecycle status
	uniqueId: string; // UUID for stable URLs (generated during creation)
	createdAt: number; // Timestamp (added during creation)
	creator: {
		username: string;
		avatar: string;
	}; // Added during creation from current user
	translations?: ServiceTranslations; // Auto-generated during creation
	naddr?: string; // NIP-19 identifier (generated after creation, added to content)
}

/**
 * Service Interface
 * Complete service object after parsing from Nostr event
 * Combines event metadata (id, npub) with content data (ServiceBody + metadata)
 * Used for displaying services in the UI
 */
export interface Service {
	id: string; // Nostr event ID (from event.id, not in content)
	npub: string; // Creator's Nostr public key (from event.pubkey, not in content)
	eventKind?: number; // Nostr event kind backing this service version
	uniqueId: string; // UUID for stable URLs (from content)
	status: ServiceStatus; // Listing lifecycle status (from content)
	title: string; // From content
	description: string; // From content
	serviceLocationTypes: ServiceLocationTypeEnum[]; // From content
	locationDetails?: ServiceLocationDetails; // From content
	pricing: ServicePricing; // From content (includes tiers, add-ons, inquiry forms, delivery times)
	instantBuyLeadHours?: number; // From content when instant-buy is enabled
	instantBuyDeliveryHours?: number; // From content for instant-buy fixed pricing delivery time
	providerWalletAddress?: string; // From content when Book Now funding should pay the provider wallet
	escrowInvoice?: string; // Blank RGB invoice published by the provider
	skills: string[]; // From content
	categories: Category[]; // From content
	searchCategory?: string;
	searchSubcategory?: string;
	portfolio?: Attachment[]; // From content
	faqs?: ServiceFAQ[]; // From content (optional)
	createdAt: number; // From content (added during creation)
	updatedAt?: number; // Calculated from event.created_at if different from content.createdAt
	creator?: {
		username: string;
		avatar: string;
		rating?: number; // May be added from profile lookup
	}; // From content (added during creation)
	translations?: ServiceTranslations; // From content (auto-generated during creation)
	// Deletion tracking (added by findServices when parsing events with deletion tags)
	isDeleted?: boolean;
	deletedAt?: number;
}

/**
 * Search Services Parameters Interface
 * Parameters for searching and filtering services
 */
export interface SearchServicesParams {
	search?: string; // Text search (title, description, skills) - uses NIP-50 search
	categories?: string[]; // Filter by categories
	deliveryTime?: number; // Filter by delivery time range (in hours)
	skills?: string[]; // Filter by skills
	serviceLocationTypes?: ServiceLocationTypeEnum[]; // Filter by location types using location_types tag (multiple select support)
	pricingType?: ServicePricingTypeEnum; // Filter by pricing model using pricing_type tag (fixed, hourly, tiered, inquiry_required)
	minPrice?: number; // Minimum price
	maxPrice?: number; // Maximum price
	location?: string; // Location-based filtering
	locationCoords?: { latitude: number; longitude: number }; // Coordinate-based radius filtering
	radius?: number; // Search radius for location
	status?: ServiceStatus[]; // Filter by service status
	sortBy?: 'relevance' | 'date' | 'price'; // Sort by relevance, date, price
	page?: number; // Pagination support
	limit?: number; // Results per page

	// Nostr-specific fields
	since?: number; // Unix timestamp in seconds
	until?: number; // Unix timestamp in seconds
	kinds?: number[]; // Event kinds to query
}

/**
 * Saved service search (stored via NIP-33, same kind as task saved searches with type tag)
 */
export interface SavedServiceSearch {
	id: string;
	name: string;
	params: SearchServicesParams;
	createdAt: number;
	notifyOnMatch?: boolean;
	isActive?: boolean;
	notificationFrequency?: string;
	unreadNotifications?: number;
}

/**
 * Nostr Service Event Interface
 * Nostr event structure for services
 */
export interface NostrServiceEvent extends NostrEvent {
	content: string; // JSON stringified ServiceBody & metadata
	tags: string[][];
}

/**
 * Service Translation Interface
 * Returned by ServiceTranslationService
 */
export interface ServiceTranslation {
	serviceId: string;
	originalTitle: string;
	translatedTitle: string;
	originalDescription: string;
	translatedDescription: string;
	translatedTiers?: Array<{
		id: string;
		name: string;
		description: string;
		features: string[];
		deliveryTime?: { display: string };
		rushDelivery?: { deliveryTime: { display: string } };
	}>;
	translatedAddOns?: Array<{
		id: string;
		name: string;
		description?: string;
	}>;
	translatedFaqs?: Array<{
		id: string;
		question: string;
		answer: string;
	}>;
	translatedDeliveryTime?: { display: string };
	translatedRushDelivery?: { deliveryTime: { display: string } };
	targetLanguage: string;
	sourceLanguage: string | undefined;
	timestamp: number;
}
