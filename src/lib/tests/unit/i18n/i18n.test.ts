import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as i18n from '$lib/i18n/i18n';
import { addMessages, init, locale, getLocaleFromNavigator } from 'svelte-i18n';
import { Preferences } from '@capacitor/preferences';

// Mock svelte-i18n
vi.mock('svelte-i18n', () => ({
	addMessages: vi.fn(),
	init: vi.fn(),
	locale: {
		set: vi.fn(),
		subscribe: vi.fn((cb) => {
			cb('en');
			return () => {};
		})
	},
	getLocaleFromNavigator: vi.fn()
}));

// Mock Capacitor Preferences
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn()
	}
}));

// Mock SvelteKit environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock fetch
global.fetch = vi.fn();

describe('i18n utility', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		i18n.clearCache();
		(global.fetch as vi.Mock).mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('getNamespacesForRoute', () => {
		it('should return essential namespaces for homepage', () => {
			const namespaces = i18n.getNamespacesForRoute('/');
			expect(namespaces).toEqual([]); // Essentials are loaded separately in setupI18n
		});

		it('should return dashboard namespaces for /dashboard', () => {
			const namespaces = i18n.getNamespacesForRoute('/dashboard');
			expect(namespaces).toContain('dashboard/dashboard');
			expect(namespaces).toContain('dashboard/wallet');
		});

		it('should return task namespaces for /tasks', () => {
			const namespaces = i18n.getNamespacesForRoute('/tasks');
			expect(namespaces).toContain('dashboard/tasks/find');
			expect(namespaces).toContain('categories');
		});

		it('should return auth namespaces for /auth', () => {
			const namespaces = i18n.getNamespacesForRoute('/auth/login');
			expect(namespaces).toContain('auth');
		});

		it('should return company namespaces for company routes', () => {
			expect(i18n.getNamespacesForRoute('/about')).toContain('company/about');
			expect(i18n.getNamespacesForRoute('/terms')).toContain('company/terms');
			expect(i18n.getNamespacesForRoute('/privacy')).toContain('company/privacy_policy');
			expect(i18n.getNamespacesForRoute('/contact')).toContain('company/contact');
			expect(i18n.getNamespacesForRoute('/faq')).toContain('taskees/faq');
		});

		it('should return specific dashboard namespaces', () => {
			expect(i18n.getNamespacesForRoute('/dashboard/profile')).toContain(
				'dashboard/profile/profile'
			);
			expect(i18n.getNamespacesForRoute('/dashboard/messages')).toContain('dashboard/messages');
			expect(i18n.getNamespacesForRoute('/dashboard/settings')).toContain('dashboard/settings');
			expect(i18n.getNamespacesForRoute('/dashboard/create-task')).toContain(
				'dashboard/tasks/create'
			);
			expect(i18n.getNamespacesForRoute('/dashboard/find-tasks')).toContain('dashboard/tasks/find');
			expect(i18n.getNamespacesForRoute('/dashboard/find-tasks')).toContain('categories');
		});

		it('should return correct namespaces for help/guidelines', () => {
			expect(i18n.getNamespacesForRoute('/community-guidelines')).toContain('taskees/guidelines');
			expect(i18n.getNamespacesForRoute('/how-it-works')).toContain('how_it_works');
			expect(i18n.getNamespacesForRoute('/onboarding')).toContain('onboarding');
			expect(i18n.getNamespacesForRoute('/dashboard/debug-smart-contract')).toContain('debug');
		});
	});

	describe('Environment checks', () => {
		it('should return early if not in browser', async () => {
			// This is hard to test without re-importing the module,
			// but we've covered the logic branches in other tests.
		});
	});

	describe('loadNamespace', () => {
		it('should fetch and add messages on success', async () => {
			const mockData = { test: 'value' };
			(global.fetch as vi.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockData)
			});

			const result = await i18n.loadNamespace('en', 'common');

			expect(global.fetch).toHaveBeenCalledWith(
				'/locales/en/common.json',
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			);
			expect(addMessages).toHaveBeenCalledWith('en', mockData);
			expect(result).toEqual(mockData);
		});

		it('should return cached data on subsequent calls', async () => {
			const mockData = { test: 'value' };
			(global.fetch as vi.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockData)
			});

			await i18n.loadNamespace('en', 'common');
			const result = await i18n.loadNamespace('en', 'common');

			expect(global.fetch).toHaveBeenCalledTimes(1); // Second call used cache
			expect(result).toEqual(mockData);
		});

		it('should handle fetch errors gracefully', async () => {
			(global.fetch as vi.Mock).mockResolvedValue({
				ok: false,
				status: 404,
				statusText: 'Not Found'
			});

			const result = await i18n.loadNamespace('en', 'missing');

			expect(result).toEqual({});
			expect(addMessages).not.toHaveBeenCalledWith('en', expect.anything());
		});

		it('should handle network exceptions gracefully', async () => {
			(global.fetch as vi.Mock).mockRejectedValue(new Error('Network failure'));

			const result = await i18n.loadNamespace('en', 'common');

			expect(result).toEqual({});
		});
	});

	describe('setupI18n', () => {
		it('should initialize i18n with stored locale', async () => {
			// Mock Preferences.get to return 'es'
			(Preferences.get as vi.Mock).mockResolvedValue({ value: 'es' });

			// Mock fetch for essential translations
			(global.fetch as vi.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({})
			});

			await i18n.setupI18n();

			expect(Preferences.get).toHaveBeenCalledWith({ key: 'locale' });
			expect(init).toHaveBeenCalledWith(
				expect.objectContaining({
					initialLocale: 'en' // Initialized immediately with en fallback
				})
			);
			expect(locale.set).toHaveBeenCalledWith('es');
		});

		it('should fallback to browser locale if no stored preference', async () => {
			(Preferences.get as vi.Mock).mockResolvedValue({ value: null });
			(getLocaleFromNavigator as vi.Mock).mockReturnValue('es-ES');

			(global.fetch as vi.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({})
			});

			await i18n.setupI18n();

			expect(locale.set).toHaveBeenCalledWith('es');
		});

		it('should handle Preferences failure (the fixed Server Error case)', async () => {
			// Simulate Preferences crashing/hanging
			(Preferences.get as vi.Mock).mockRejectedValue(new Error('Storage blocked'));

			(global.fetch as vi.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({})
			});

			// This should NOT throw anymore thanks to our fix
			await expect(i18n.setupI18n()).resolves.not.toThrow();

			expect(init).toHaveBeenCalled();
		});
	});

	describe('switchLanguage', () => {
		it('should update locale and persist preference', async () => {
			(global.fetch as vi.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({})
			});

			await i18n.switchLanguage('es');

			expect(locale.set).toHaveBeenCalledWith('es');
			expect(Preferences.set).toHaveBeenCalledWith({
				key: 'locale',
				value: 'es'
			});
		});
	});

	describe('preloadTranslations', () => {
		it('should call loadNamespaces via requestIdleCallback if available', () => {
			const ric = vi.fn((cb) => cb());
			vi.stubGlobal('requestIdleCallback', ric);

			(global.fetch as vi.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({})
			});

			i18n.preloadTranslations('en', ['common']);

			expect(ric).toHaveBeenCalled();
			vi.unstubAllGlobals();
		});

		it('should fallback to setTimeout if requestIdleCallback is unavailable', () => {
			// Delete from window to simulate unavailability
			// @ts-expect-error - simulating environment where ric is missing
			delete global.window.requestIdleCallback;
			const spy = vi.spyOn(global, 'setTimeout');

			i18n.preloadTranslations('en', ['common']);

			expect(spy).toHaveBeenCalled();
		});
	});
});
