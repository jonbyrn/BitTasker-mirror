import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { writable } from 'svelte/store';

export const darkMode = writable<boolean>(true);

// Defer theme initialization to prevent blocking main thread
const initializeTheme = () => {
	if ('requestIdleCallback' in window) {
		requestIdleCallback(async () => {
			const { value: savedDarkMode } = await Preferences.get({ key: StorageKeys.THEME });
			if (savedDarkMode) {
				darkMode.set(savedDarkMode === 'true');
			}
		}, { timeout: 500 });
	} else {
		setTimeout(async () => {
			const { value: savedDarkMode } = await Preferences.get({ key: StorageKeys.THEME });
			if (savedDarkMode) {
				darkMode.set(savedDarkMode === 'true');
			}
		}, 100);
	}
};

// Initialize theme
initializeTheme();

export async function setDarkMode(isDarkMode: boolean) {
	// Defer the Preferences.set call to prevent blocking
	const deferSet = () => {
		if ('requestIdleCallback' in window) {
			requestIdleCallback(async () => {
				await Preferences.set({
					key: StorageKeys.THEME,
					value: isDarkMode.toString()
				});
			}, { timeout: 1000 });
		} else {
			setTimeout(async () => {
				await Preferences.set({
					key: StorageKeys.THEME,
					value: isDarkMode.toString()
				});
			}, 100);
		}
	};
	
	deferSet();
	
	// Update DOM immediately for responsive UI
	document.documentElement.setAttribute(
		'data-theme',
		isDarkMode ? 'BitTasker-Dark' : 'BitTasker-Light'
	);
}
