import { describe, expect, it } from 'vitest';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import {
	DEFAULT_INSTANT_BUY_LEAD_HOURS,
	sanitizeInstantBuyLeadHours,
	supportsInstantBuyAuthoring,
	validateInstantBuyLeadHours
} from '$lib/utils/service-instant-buy/authoring';

describe('service instant-buy authoring helpers', () => {
	it('supports instant-buy authoring for fixed, hourly, and tiered pricing', () => {
		expect(supportsInstantBuyAuthoring(ServicePricingTypeEnum.FIXED)).toBe(true);
		expect(supportsInstantBuyAuthoring(ServicePricingTypeEnum.HOURLY)).toBe(true);
		expect(supportsInstantBuyAuthoring(ServicePricingTypeEnum.TIERED)).toBe(true);
		expect(supportsInstantBuyAuthoring(ServicePricingTypeEnum.INQUIRY_REQUIRED)).toBe(false);
		expect(supportsInstantBuyAuthoring(undefined)).toBe(false);
	});

	it('sanitizes lead hours fail-closed for unsupported pricing or invalid values', () => {
		expect(
			sanitizeInstantBuyLeadHours(
				ServicePricingTypeEnum.INQUIRY_REQUIRED,
				DEFAULT_INSTANT_BUY_LEAD_HOURS
			)
		).toBeUndefined();
		expect(sanitizeInstantBuyLeadHours(ServicePricingTypeEnum.FIXED, -1)).toBeUndefined();
		expect(sanitizeInstantBuyLeadHours(ServicePricingTypeEnum.FIXED, 721)).toBeUndefined();
		expect(sanitizeInstantBuyLeadHours(ServicePricingTypeEnum.FIXED, 1.5)).toBeUndefined();
	});

	it('preserves valid whole-number lead hours for supported pricing', () => {
		expect(
			sanitizeInstantBuyLeadHours(ServicePricingTypeEnum.FIXED, DEFAULT_INSTANT_BUY_LEAD_HOURS)
		).toBe(DEFAULT_INSTANT_BUY_LEAD_HOURS);
		expect(sanitizeInstantBuyLeadHours(ServicePricingTypeEnum.TIERED, 0)).toBe(0);
		expect(sanitizeInstantBuyLeadHours(ServicePricingTypeEnum.TIERED, 720)).toBe(720);
	});

	it('treats missing lead hours as valid when instant buy is disabled', () => {
		expect(validateInstantBuyLeadHours(ServicePricingTypeEnum.FIXED, undefined)).toEqual({
			valid: true
		});
	});

	it('returns a deterministic validation code for invalid lead-hour inputs', () => {
		expect(validateInstantBuyLeadHours(ServicePricingTypeEnum.FIXED, 999)).toEqual({
			valid: false,
			code: 'invalid_instant_buy_lead_hours'
		});
	});
});
