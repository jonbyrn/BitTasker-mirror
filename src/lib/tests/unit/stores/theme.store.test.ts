import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
	THEME_LOCAL_KEY,
	darkMode,
	initializeTheme,
	toggleDarkMode
} from '$lib/stores/theme.store';

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: null }),
		set: vi.fn().mockResolvedValue(undefined)
	}
}));

describe('theme.store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.removeItem(THEME_LOCAL_KEY);
		darkMode.set(false);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('darkMode writable', () => {
		it('should allow reading and setting darkMode', () => {
			expect(get(darkMode)).toBe(false);
			darkMode.set(true);
			expect(get(darkMode)).toBe(true);
		});
	});

	describe('initializeTheme', () => {
		it('should set darkMode from saved preference when value is "true"', async () => {
			const { Preferences } = await import('@capacitor/preferences');
			vi.mocked(Preferences.get).mockResolvedValue({ value: 'true' });
			darkMode.set(false);
			await initializeTheme();
			expect(get(darkMode)).toBe(true);
		});

		it('should set darkMode from saved preference when value is "false"', async () => {
			const { Preferences } = await import('@capacitor/preferences');
			vi.mocked(Preferences.get).mockResolvedValue({ value: 'false' });
			darkMode.set(true);
			await initializeTheme();
			expect(get(darkMode)).toBe(false);
		});

		it('follows the system theme when no choice is saved', async () => {
			const { Preferences } = await import('@capacitor/preferences');
			vi.mocked(Preferences.get).mockResolvedValue({ value: null });
			darkMode.set(true);
			await initializeTheme();
			expect(get(darkMode)).toBe(false);
			expect(document.documentElement.getAttribute('data-theme')).toBe('light');
			expect(localStorage.getItem(THEME_LOCAL_KEY)).toBeNull();
		});

		it('should not throw when Preferences.get rejects', async () => {
			const { Preferences } = await import('@capacitor/preferences');
			vi.mocked(Preferences.get).mockRejectedValue(new Error('Storage error'));
			await expect(initializeTheme()).resolves.toBeUndefined();
		});
	});

	describe('toggleDarkMode', () => {
		it('should flip darkMode and persist', async () => {
			darkMode.set(false);
			await toggleDarkMode();
			expect(get(darkMode)).toBe(true);
			const { Preferences } = await import('@capacitor/preferences');
			expect(Preferences.set).toHaveBeenCalledWith({
				key: expect.any(String),
				value: 'true'
			});
		});

		it('should set data-theme on document when toggling', async () => {
			darkMode.set(false);
			await toggleDarkMode();
			expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
			expect(document.documentElement.classList.contains('dark')).toBe(true);
			expect(localStorage.setItem).toHaveBeenCalledWith(THEME_LOCAL_KEY, 'true');
		});
	});
});
