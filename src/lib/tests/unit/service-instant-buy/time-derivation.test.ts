import { describe, expect, it } from 'vitest';
import {
	deliveryTimeToSeconds,
	deriveInstantBuySchedule,
	deriveServiceInstantBuySchedule
} from '$lib/utils/service-instant-buy/time-derivation';

describe('service instant-buy time derivation', () => {
	it('converts delivery-time units to seconds deterministically', () => {
		expect(deliveryTimeToSeconds({ min: 1, max: 2, unit: 'hour' })).toBe(7200);
		expect(deliveryTimeToSeconds({ min: 1, max: 2, unit: 'day' })).toBe(172800);
		expect(deliveryTimeToSeconds({ min: 1, max: 2, unit: 'week' })).toBe(1209600);
		expect(deliveryTimeToSeconds({ min: 1, max: 2, unit: 'month' })).toBe(5184000);
	});

	it('derives start and end times from lead hours and delivery time', () => {
		expect(
			deriveInstantBuySchedule(1_700_000_000, 24, {
				min: 2,
				max: 3,
				unit: 'day'
			})
		).toEqual({
			estimatedStartTime: 1_700_086_400,
			estimatedEndTime: 1_700_345_600,
			deliverySeconds: 259200
		});
	});

	it('uses the selected tier delivery time for tiered services', () => {
		expect(
			deriveServiceInstantBuySchedule(
				{
					status: 'active',
					instantBuyLeadHours: 12,
					pricing: {
						type: 'TIERED',
						tiers: [
							{
								id: 'premium',
								price: 300,
								deliveryTime: { value: 2, unit: 'week' }
							}
						]
					}
				},
				'premium',
				1_700_000_000
			)
		).toEqual({
			estimatedStartTime: 1_700_043_200,
			estimatedEndTime: 1_701_252_800,
			deliverySeconds: 1209600
		});
	});

	it('fails closed when the service is not instant-buy eligible', () => {
		expect(() =>
			deriveServiceInstantBuySchedule(
				{
					status: 'active',
					pricing: {
						type: 'FIXED',
						amount: 120
					}
				},
				undefined,
				1_700_000_000
			)
		).toThrow('missing_lead_hours');
	});
});
