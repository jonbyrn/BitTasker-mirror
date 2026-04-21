import { describe, expect, it } from 'vitest';
import { sections } from '$lib/utils/consts';

describe('sections', () => {
	it('includes reviews before wallet in the shared protected navigation', () => {
		const reviewIndex = sections.findIndex((section) => section.id === 'reviews');
		const walletIndex = sections.findIndex((section) => section.id === 'wallet');

		expect(reviewIndex).toBeGreaterThan(-1);
		expect(walletIndex).toBeGreaterThan(-1);
		expect(reviewIndex).toBeLessThan(walletIndex);
		expect(sections[reviewIndex]).toMatchObject({
			path: '/reviews',
			label: 'navbar.reviews',
			icon: 'mdi:comment-text-outline',
			mobile: false
		});
	});
});
