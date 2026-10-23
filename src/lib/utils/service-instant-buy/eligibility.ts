import type { ContractPurchaseMode } from '$lib/types/contract';

export type InstantBuyPricingType = 'FIXED' | 'HOURLY' | 'TIERED' | 'INQUIRY_REQUIRED';
export type DeliveryUnit = 'hour' | 'day' | 'week' | 'month';

export interface DeliveryTimeLike {
	min?: number;
	max?: number;
	value?: number;
	unit: DeliveryUnit;
}

export interface InstantBuyTierLike {
	id: string;
	price: number;
	deliveryTime?: DeliveryTimeLike;
	rushDelivery?: { enabled: boolean };
}

export interface InstantBuyServiceLike {
	id?: string;
	uniqueId?: string;
	serviceAddress?: string;
	status?: string;
	instantBuyLeadHours?: number;
	instantBuyDeliveryHours?: number;
	pricing?: {
		type: InstantBuyPricingType;
		amount?: number;
		hourlyRate?: number;
		deliveryTime?: DeliveryTimeLike;
		rushDelivery?: { enabled: boolean };
		tiers?: InstantBuyTierLike[];
		addOns?: Array<{ id: string }>;
	};
	locationDetails?: {
		taskerLocation?: {
			perDistanceCharge?: { amount: number };
		};
		taskeeLocation?: {
			perDistanceCharge?: { amount: number };
		};
	};
}

export type InstantBuyEligibilityCode =
	| 'eligible'
	| 'missing_service'
	| 'inactive_service'
	| 'invalid_pricing_type'
	| 'missing_lead_hours'
	| 'invalid_lead_hours'
	| 'unsupported_rush_delivery'
	| 'missing_delivery_time'
	| 'missing_selected_tier'
	| 'invalid_selected_tier';

export interface InstantBuyEligibilityResult {
	eligible: boolean;
	code: InstantBuyEligibilityCode;
	purchaseMode: ContractPurchaseMode;
	selectedTierId?: string;
}

function isValidLeadHours(value: number | undefined): value is number {
	return Number.isInteger(value) && value >= 0 && value <= 720;
}

export function resolveInstantBuyTier(
	service: InstantBuyServiceLike,
	selectedTierId?: string
): InstantBuyTierLike | null {
	if (service.pricing?.type !== 'TIERED') {
		return null;
	}

	if (!selectedTierId) {
		return null;
	}

	return service.pricing.tiers?.find((tier) => tier.id === selectedTierId) ?? null;
}

export function getInstantBuyEligibility(
	service: InstantBuyServiceLike | null | undefined,
	selectedTierId?: string
): InstantBuyEligibilityResult {
	if (!service) {
		return { eligible: false, code: 'missing_service', purchaseMode: 'instant_buy' };
	}

	if (service.status && service.status !== 'active') {
		return { eligible: false, code: 'inactive_service', purchaseMode: 'instant_buy' };
	}

	const pricing = service.pricing;
	if (
		!pricing ||
		(pricing.type !== 'FIXED' && pricing.type !== 'TIERED' && pricing.type !== 'HOURLY')
	) {
		return { eligible: false, code: 'invalid_pricing_type', purchaseMode: 'instant_buy' };
	}

	if (service.instantBuyLeadHours == null) {
		return { eligible: false, code: 'missing_lead_hours', purchaseMode: 'instant_buy' };
	}

	if (!isValidLeadHours(service.instantBuyLeadHours)) {
		return { eligible: false, code: 'invalid_lead_hours', purchaseMode: 'instant_buy' };
	}

	if (pricing.type === 'FIXED' || pricing.type === 'HOURLY') {
		if (
			pricing.type === 'HOURLY' &&
			!(typeof pricing.hourlyRate === 'number' && pricing.hourlyRate > 0)
		) {
			return { eligible: false, code: 'invalid_pricing_type', purchaseMode: 'instant_buy' };
		}

		// Eligible if either pricing.deliveryTime OR service.instantBuyDeliveryHours is present
		if (!pricing.deliveryTime && !service.instantBuyDeliveryHours) {
			return { eligible: false, code: 'missing_delivery_time', purchaseMode: 'instant_buy' };
		}

		return { eligible: true, code: 'eligible', purchaseMode: 'instant_buy' };
	}

	if (!selectedTierId) {
		return { eligible: false, code: 'missing_selected_tier', purchaseMode: 'instant_buy' };
	}

	const tier = resolveInstantBuyTier(service, selectedTierId);
	if (!tier) {
		return { eligible: false, code: 'invalid_selected_tier', purchaseMode: 'instant_buy' };
	}

	if (!tier.deliveryTime) {
		return { eligible: false, code: 'missing_delivery_time', purchaseMode: 'instant_buy' };
	}

	return {
		eligible: true,
		code: 'eligible',
		purchaseMode: 'instant_buy',
		selectedTierId
	};
}

export function isServiceInstantBuyEligible(
	service: InstantBuyServiceLike | null | undefined,
	selectedTierId?: string
): boolean {
	return getInstantBuyEligibility(service, selectedTierId).eligible;
}
