import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

export const DEFAULT_INSTANT_BUY_LEAD_HOURS = 24;
export const MIN_INSTANT_BUY_LEAD_HOURS = 0;
export const MAX_INSTANT_BUY_LEAD_HOURS = 720;

export const DEFAULT_INSTANT_BUY_DELIVERY_HOURS = 24;
export const MIN_INSTANT_BUY_DELIVERY_HOURS = 1;

export type InstantBuyTimeUnit = 'minute' | 'hour' | 'day' | 'week';

export const INSTANT_BUY_TIME_UNIT_HOURS: Record<InstantBuyTimeUnit, number> = {
	minute: 1 / 60,
	hour: 1,
	day: 24,
	week: 24 * 7
};

export function supportsInstantBuyAuthoring(
	pricingType: ServicePricingTypeEnum | undefined
): boolean {
	return (
		pricingType === ServicePricingTypeEnum.FIXED || pricingType === ServicePricingTypeEnum.TIERED
	);
}

export function inferInstantBuyTimeUnit(hours: number | null | undefined): InstantBuyTimeUnit {
	if (hours != null && hours > 0 && hours % INSTANT_BUY_TIME_UNIT_HOURS.week === 0) {
		return 'week';
	}

	if (hours != null && hours > 0 && hours % INSTANT_BUY_TIME_UNIT_HOURS.day === 0) {
		return 'day';
	}

	return 'hour';
}

export function formatInstantBuyDurationInput(
	hours: number | null | undefined,
	unit: InstantBuyTimeUnit
): string {
	if (hours == null) {
		return '';
	}

	const rawValue = hours / INSTANT_BUY_TIME_UNIT_HOURS[unit];
	if (Number.isInteger(rawValue)) {
		return rawValue.toString();
	}

	return rawValue.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Keep the number on screen when the unit changes.
 * One hour shown as 1, then Days, is 24 hours — not 1 hour.
 */
export function retargetDurationHours(
	hours: number | null | undefined,
	from: InstantBuyTimeUnit,
	to: InstantBuyTimeUnit,
	minimum = 1
): number {
	const shown = Number.parseFloat(formatInstantBuyDurationInput(hours, from));
	const amount = Number.isFinite(shown) && shown > 0 ? shown : minimum > 0 ? minimum : 0;
	if (amount === 0) return 0;
	return Math.max(minimum, Math.round(amount * INSTANT_BUY_TIME_UNIT_HOURS[to]));
}

export function convertInstantBuyDurationToHours(
	rawValue: string,
	unit: InstantBuyTimeUnit
): number | undefined {
	const trimmedValue = rawValue.trim();
	if (!trimmedValue) {
		return undefined;
	}

	const parsedValue = Number.parseFloat(trimmedValue);
	if (!Number.isFinite(parsedValue) || parsedValue < 0) {
		return undefined;
	}

	return Math.round(parsedValue * INSTANT_BUY_TIME_UNIT_HOURS[unit]);
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

	if (leadHours < MIN_INSTANT_BUY_LEAD_HOURS || leadHours > MAX_INSTANT_BUY_LEAD_HOURS) {
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
