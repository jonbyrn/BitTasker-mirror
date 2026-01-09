import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { writable } from 'svelte/store';

// Get initial theme from system preference
const getInitialTheme = (): boolean => {
	if (typeof window === 'undefined') return true;
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export const darkMode = writable<boolean>(getInitialTheme());

// Initialize theme from saved preference (called from layout)
export async function initializeTheme() {
	if (typeof window === 'undefined') return;
	
	try {
		const { value: savedDarkMode } = await Preferences.get({ key: StorageKeys.THEME });
		
		if (savedDarkMode !== null) {
			const isDark = savedDarkMode === 'true';
			darkMode.set(isDark);
			updateDOM(isDark);
		} else {
			// No saved preference, use system theme
			updateDOM(getInitialTheme());
		}
	} catch (error) {
		console.warn('Failed to load theme preference:', error);
	}
}

// Update DOM theme attribute
function updateDOM(isDarkMode: boolean) {
	if (typeof document !== 'undefined') {
		document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
	}
}

// Toggle dark mode and persist
export async function toggleDarkMode() {
	darkMode.update(current => {
		const newValue = !current;
		updateDOM(newValue);
		persistTheme(newValue);
		return newValue;
	});
}

// Persist theme preference
async function persistTheme(isDarkMode: boolean) {
	try {
		await Preferences.set({
			key: StorageKeys.THEME,
			value: isDarkMode.toString()
		});
	} catch (error) {
		console.warn('Failed to save theme preference:', error);
	}
}
