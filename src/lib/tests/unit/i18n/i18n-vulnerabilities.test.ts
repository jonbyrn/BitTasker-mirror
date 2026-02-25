import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as i18n from '$lib/i18n/i18n';
import { init } from 'svelte-i18n';
import { get } from 'svelte/store';

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
	getLocaleFromNavigator: vi.fn(() => 'en')
}));

// Mock Capacitor Preferences
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: 'en' }),
		set: vi.fn().mockResolvedValue({})
	}
}));

// Mock SvelteKit environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock fetch
global.fetch = vi.fn();

describe('i18n Vulnerability Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		i18n.clearCache();
	});

	it('VULNERABILITY: init() should be called immediately, NOT after network', async () => {
		// Mock a slow network request
		let resolveFetch: (value: unknown) => void = () => {};
		const fetchPromise = new Promise((resolve) => {
			resolveFetch = resolve;
		});
		(global.fetch as vi.Mock).mockReturnValue(fetchPromise);

		// Start initialization
		const setupPromise = i18n.setupI18n();

		// EXPECTATION: init() should have been called by now to prevent component crashes
		// REALITY: In current code, it waits for fetch first.
		expect(init).toHaveBeenCalled();

		resolveFetch({ ok: true, json: () => Promise.resolve({}) });
		await setupPromise;
	});

	it('VULNERABILITY: Simultaneous requests should only fire ONE fetch', async () => {
		(global.fetch as vi.Mock).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ key: 'val' })
		});

		// Trigger two loads at once
		await Promise.all([i18n.loadNamespace('en', 'common'), i18n.loadNamespace('en', 'common')]);

		// Should only be called once
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it('VULNERABILITY: Loading state should use a counter, not a boolean', async () => {
		(global.fetch as vi.Mock).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({})
		});

		// Start two parallel operations that both toggle loading
		const p1 = i18n.switchLanguage('es');
		const p2 = i18n.setupI18n();

		await p1; // p1 finishes first

		// If it's a boolean, p1 will have set loading to false
		// even though setupI18n (p2) is still doing work.
		// (This assumes setupI18n is slower or has more steps)
		expect(get(i18n.isI18nLoading)).toBe(true);

		await p2;
		expect(get(i18n.isI18nLoading)).toBe(false);
	});
});
