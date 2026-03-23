/**
 * Service Location Type Enum
 * Multiple select location types for services
 */
export enum ServiceLocationTypeEnum {
	REMOTE = 'remote', // Online/virtual service
	TASKER_LOCATION = 'tasker_location', // In-person at Tasker's location - flag indicating Taskee can travel to Tasker's location (Tasker's location unknown at listing time)
	TASKEE_LOCATION = 'taskee_location' // In-person at Taskee's location - flag indicating service can be provided at Taskee's specified location or global location
}

/**
 * Service Pricing Type Enum
 * Different pricing models for services
 */
export enum ServicePricingTypeEnum {
	FIXED = 'FIXED', // Fixed price
	HOURLY = 'HOURLY', // Hourly rate
	TIERED = 'TIERED', // Multiple service tiers with different features/prices
	INQUIRY_REQUIRED = 'INQUIRY_REQUIRED' // Tasker must request a quote for pricing details
}

/**
 * Service Step Enum
 * Steps in the service listing wizard
 */
export enum ServiceStepEnum {
	BASICS = 'basics',
	LOCATION = 'location',
	DETAILS = 'details',
	PRICING = 'pricing',
	TIERS = 'tiers',
	ADD_ONS = 'add_ons',
	FAQS = 'faqs',
	INQUIRY_FORM = 'inquiry_form',
	PORTFOLIO = 'portfolio',
	REVIEW = 'review'
}

/**
 * Service Status
 * Note: deletion is handled via NIP-09 deletion events (kind 5), not status.
 */
export type ServiceStatus = 'active' | 'inactive' | 'sold';
