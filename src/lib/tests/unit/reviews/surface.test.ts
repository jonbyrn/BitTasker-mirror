import { describe, expect, it } from 'vitest';
import { buildReviewComposerCategoryGroups, toCategoryRatings } from '$lib/reviews';

describe('review surface category mappings', () => {
	it('uses client-facing dimensions for tasker and client review targets', () => {
		for (const role of ['tasker', 'client'] as const) {
			const [group] = buildReviewComposerCategoryGroups(role);
			expect(group.heading).toBe('Client feedback');
			expect(group.categories.map((category) => category.id)).toEqual([
				'communication',
				'clarity',
				'paymentTimeliness'
			]);
			expect(toCategoryRatings([], role)).toEqual({
				communication: 5,
				clarity: 5,
				paymentTimeliness: 5
			});
		}
	});

	it('uses provider-facing dimensions for provider, freelancer, and taskee review targets', () => {
		for (const role of ['provider', 'freelancer', 'taskee'] as const) {
			const [group] = buildReviewComposerCategoryGroups(role);
			expect(group.heading).toBe('Provider feedback');
			expect(group.categories.map((category) => category.id)).toEqual([
				'workQuality',
				'experience',
				'deliverySpeed'
			]);
			expect(toCategoryRatings([], role)).toEqual({
				workQuality: 5,
				experience: 5,
				deliverySpeed: 5
			});
		}
	});
});
