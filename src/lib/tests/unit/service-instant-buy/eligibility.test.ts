import { describe, expect, it } from 'vitest';
import {
	getInstantBuyEligibility,
	isServiceInstantBuyEligible
} from '$lib/utils/service-instant-buy/eligibility';

const baseService = {
	status: 'active',
	instantBuyLeadHours: 24,
	pricing: {
		type: 'FIXED' as const,
		amount: 150,
		deliveryTime: { min: 2, max: 3, unit: 'day' as const },
		addOns: []
	}
};

describe('service instant-buy eligibility', () => {
	it('accepts eligible fixed-price services', () => {
		expect(getInstantBuyEligibility(baseService)).toEqual({
			eligible: true,
			code: 'eligible',
			purchaseMode: 'instant_buy'
		});
		expect(isServiceInstantBuyEligible(baseService)).toBe(true);
	});

	it('requires a tier selection for tiered services', () => {
		expect(
			getInstantBuyEligibility({
				...baseService,
				pricing: {
					type: 'TIERED',
					tiers: [
						{
							id: 'standard',
							price: 200,
							deliveryTime: { value: 2, unit: 'week' as const }
						}
					]
				}
			})
		).toEqual({
			eligible: false,
			code: 'missing_selected_tier',
			purchaseMode: 'instant_buy'
		});
	});

	it('allows add-ons, rush delivery, and distance fees', () => {
		expect(
			getInstantBuyEligibility({
				...baseService,
				pricing: {
					...baseService.pricing,
					addOns: [{ id: 'source-files' }]
				}
			})
		).toEqual({
			eligible: true,
			code: 'eligible',
			purchaseMode: 'instant_buy'
		});

		expect(
			getInstantBuyEligibility({
				...baseService,
				pricing: {
					...baseService.pricing
				}
			}).code
		).toBe('eligible');

		expect(
			getInstantBuyEligibility({
				...baseService,
				locationDetails: {
					taskerLocation: {
						perDistanceCharge: { amount: 10 }
					}
				}
			}).code
		).toBe('eligible');
	});

	it('rejects invalid lead-hour and timing inputs', () => {
		expect(
			getInstantBuyEligibility({
				...baseService,
				instantBuyLeadHours: undefined
			}).code
		).toBe('missing_lead_hours');

		expect(
			getInstantBuyEligibility({
				...baseService,
				instantBuyLeadHours: 1000
			}).code
		).toBe('invalid_lead_hours');

		expect(
			getInstantBuyEligibility({
				...baseService,
				pricing: {
					type: 'FIXED',
					amount: 100
				}
			}).code
		).toBe('missing_delivery_time');
	});

	it('fails closed for missing services, inactive services, and invalid tier ids', () => {
		expect(getInstantBuyEligibility(null).code).toBe('missing_service');

		expect(
			getInstantBuyEligibility({
				...baseService,
				status: 'inactive'
			}).code
		).toBe('inactive_service');

		expect(
			getInstantBuyEligibility(
				{
					...baseService,
					pricing: {
						type: 'TIERED',
						tiers: [
							{
								id: 'premium',
								price: 200,
								deliveryTime: { value: 2, unit: 'week' as const }
							}
						]
					}
				},
				'not-a-tier'
			).code
		).toBe('invalid_selected_tier');
	});
});
