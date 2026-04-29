import { describe, expect, it } from 'vitest';
import { getNamespacesForRoute } from '$lib/i18n/i18n';

describe('getNamespacesForRoute', () => {
	it('loads protected workspace namespaces for /earning', () => {
		const namespaces = getNamespacesForRoute('/earning');

		expect(namespaces).toContain('dashboard/dashboard');
		expect(namespaces).toContain('dashboard/bids');
		expect(namespaces).toContain('dashboard/services/my-services');
		expect(namespaces).toContain('dashboard/services/detail');
	});
});
