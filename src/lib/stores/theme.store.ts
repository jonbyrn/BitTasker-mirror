import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { writable } from 'svelte/store';

export const darkMode = writable<boolean>(true);

export async function setDarkMode(isDarkMode: boolean) {
	await Preferences.set({
		key: StorageKeys.THEME,
		value: isDarkMode.toString()
	});
	document.documentElement.setAttribute(
		'data-theme',
		isDarkMode ? 'BitTasker-Dark' : 'BitTasker-Light'
	);
}
