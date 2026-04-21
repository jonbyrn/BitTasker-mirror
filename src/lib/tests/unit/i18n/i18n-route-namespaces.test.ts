import { describe, expect, it } from 'vitest';
import { getNamespacesForRoute } from '$lib/i18n/i18n';
import { buildReviewsUrl, parseReviewRoute } from '$lib/reviews';

describe('getNamespacesForRoute', () => {
	it('loads protected workspace namespaces for /earning', () => {
		const namespaces = getNamespacesForRoute('/earning');

		expect(namespaces).toContain('dashboard/dashboard');
		expect(namespaces).toContain('dashboard/bids');
		expect(namespaces).toContain('dashboard/services/my-services');
		expect(namespaces).toContain('dashboard/services/detail');
		expect(namespaces).toContain('reviews');
	});

	it('loads the reviews namespace for /reviews', () => {
		const namespaces = getNamespacesForRoute('/reviews');

		expect(namespaces).toContain('reviews');
	});

	it('defaults bare /reviews URLs to the pending tab', () => {
		const url = new URL('https://example.test/reviews');

		expect(parseReviewRoute(url).tab).toBe('pending');
		expect(buildReviewsUrl(url)).toBe('https://example.test/reviews?tab=pending');
	});
});
