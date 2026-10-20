import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getNamespacesForRoute } from '$lib/i18n/i18n';

const mockUpdateLanguage = vi.fn().mockResolvedValue(undefined);

vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		updateLanguage: mockUpdateLanguage
	}
}));

describe('getNamespacesForRoute', () => {
	it('loads protected workspace namespaces for /earning', () => {
		const namespaces = getNamespacesForRoute('/earning');

		expect(namespaces).toContain('dashboard/dashboard');
		expect(namespaces).toContain('dashboard/bids');
		expect(namespaces).toContain('dashboard/services/my-services');
		expect(namespaces).toContain('dashboard/services/detail');
	});

	it('loads the dashboard shell on routes that render raw keys', () => {
		for (const route of [
			'/profile',
			'/notifications',
			'/feedback',
			'/reviews',
			'/services',
			'/settings'
		]) {
			expect(getNamespacesForRoute(route)).toContain('dashboard/dashboard');
		}
		expect(getNamespacesForRoute('/profile')).toContain('dashboard/profile/profile');
		expect(getNamespacesForRoute('/settings')).toContain('dashboard/settings');
		expect(getNamespacesForRoute('/reviews')).toContain('reviews');
		expect(getNamespacesForRoute('/feedback')).toContain('dashboard/feedback');
	});
});

describe('switchLanguage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should call authService.updateLanguage with the new locale', async () => {
		const { switchLanguage } = await import('$lib/i18n/i18n');

		await switchLanguage('es');

		expect(mockUpdateLanguage).toHaveBeenCalledWith('es');
	});

	it('should call authService.updateLanguage with en locale', async () => {
		const { switchLanguage } = await import('$lib/i18n/i18n');

		await switchLanguage('en');

		expect(mockUpdateLanguage).toHaveBeenCalledWith('en');
	});
});
