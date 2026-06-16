import { describe, expect, it } from 'vitest';
import { buildEarningQueryUrl } from '$lib/utils/dashboardQuery';

/**
 * Legacy `?tab=my-services` handling now lives in earning +page
 * (client goto). This asserts the canonical earning URL shape that code builds.
 */
describe('legacy my-services → earning', () => {
	it('builds /earning?tab=my-services on the current origin', () => {
		const nextUrl = new URL('/earning', 'https://bittasker.test');
		const href = buildEarningQueryUrl(nextUrl, { tab: 'my-services' });
		expect(href).toBe('https://bittasker.test/earning?tab=my-services');
	});
});
