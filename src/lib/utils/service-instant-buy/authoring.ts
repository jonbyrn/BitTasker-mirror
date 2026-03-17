import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

export const DEFAULT_INSTANT_BUY_LEAD_HOURS = 24;
export const MIN_INSTANT_BUY_LEAD_HOURS = 0;
export const MAX_INSTANT_BUY_LEAD_HOURS = 720;

export const DEFAULT_INSTANT_BUY_DELIVERY_HOURS = 24;
export const MIN_INSTANT_BUY_DELIVERY_HOURS = 1;

export function supportsInstantBuyAuthoring(pricingType: ServicePricingTypeEnum | undefined): boolean {
	return (
		pricingType === ServicePricingTypeEnum.FIXED ||
		pricingType === ServicePricingTypeEnum.TIERED
	);
}

export function sanitizeInstantBuyLeadHours(
	pricingType: ServicePricingTypeEnum | undefined,
	leadHours: number | null | undefined
): number | undefined {
	if (!supportsInstantBuyAuthoring(pricingType) || leadHours == null) {
		return undefined;
	}

	if (!Number.isInteger(leadHours)) {
		return undefined;
	}

	if (
		leadHours < MIN_INSTANT_BUY_LEAD_HOURS ||
		leadHours > MAX_INSTANT_BUY_LEAD_HOURS
	) {
		return undefined;
	}

	return leadHours;
}

export function validateInstantBuyLeadHours(
	pricingType: ServicePricingTypeEnum | undefined,
	leadHours: number | null | undefined
): { valid: true } | { valid: false; code: 'invalid_instant_buy_lead_hours' } {
	const sanitizedLeadHours = sanitizeInstantBuyLeadHours(pricingType, leadHours);
	if (leadHours == null) {
		return { valid: true };
	}

	if (sanitizedLeadHours == null) {
		return { valid: false, code: 'invalid_instant_buy_lead_hours' };
	}

	return { valid: true };
}

export function sanitizeInstantBuyDeliveryHours(
	pricingType: ServicePricingTypeEnum | undefined,
	deliveryHours: number | null | undefined
): number | undefined {
	if (!supportsInstantBuyAuthoring(pricingType) || deliveryHours == null) {
		return undefined;
	}

	if (!Number.isInteger(deliveryHours)) {
		return undefined;
	}

	if (deliveryHours < MIN_INSTANT_BUY_DELIVERY_HOURS) {
		return undefined;
	}

	return deliveryHours;
}

export function validateInstantBuyDeliveryHours(
	pricingType: ServicePricingTypeEnum | undefined,
	deliveryHours: number | null | undefined
): { valid: true } | { valid: false; code: 'invalid_instant_buy_delivery_hours' } {
	const sanitizedDeliveryHours = sanitizeInstantBuyDeliveryHours(pricingType, deliveryHours);
	if (deliveryHours == null) {
		return { valid: true };
	}

	if (sanitizedDeliveryHours == null) {
		return { valid: false, code: 'invalid_instant_buy_delivery_hours' };
	}

	return { valid: true };
}
