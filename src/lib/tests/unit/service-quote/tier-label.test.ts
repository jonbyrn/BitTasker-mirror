import { describe, expect, it } from 'vitest';
import { resolveServiceTierLabel } from '$lib/utils/service-quote/tier-label';

describe('resolveServiceTierLabel', () => {
	it('returns the tier name when the service tiers contain the selected tier id', () => {
		expect(
			resolveServiceTierLabel(
				{
					pricing: {
						tiers: [
							{ id: 'standard', name: 'Standard Plan' },
							{ id: 'premium', name: 'Premium Plan' }
						]
					}
				} as unknown as NonNullable<Parameters<typeof resolveServiceTierLabel>[0]>,
				'premium'
			)
		).toBe('Premium Plan');
	});

	it('falls back to the original tier id when the service tier is unavailable', () => {
		expect(resolveServiceTierLabel(null as unknown as NonNullable<Parameters<typeof resolveServiceTierLabel>[0]>, 'premium')).toBe('premium');
	});
});
