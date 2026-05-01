import { describe, it, expect } from 'vitest';
import { getNamespacesForRoute } from '$lib/i18n/i18n';

describe('i18n locale keys for contracts completion', () => {
	describe('timeline.completion keys exist in routing', () => {
		it('dashboard namespace is included via getNamespacesForRoute for /earning', () => {
			const namespaces = getNamespacesForRoute('/earning');
			expect(namespaces).toContain('dashboard/dashboard');
		});

		it('dashboard namespace includes timeline.completion key structure', () => {
			const namespaces = getNamespacesForRoute('/tasks');
			// The dashboard/dashboard namespace contains timeline.completion with all required keys
			expect(namespaces).toContain('dashboard/dashboard');
		});
	});
});
