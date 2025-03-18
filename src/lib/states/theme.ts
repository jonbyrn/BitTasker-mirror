import { Preferences } from '@capacitor/preferences';
import { writable } from 'svelte/store';

export const darkMode = writable<boolean>(true);

export async function setDarkMode(isDarkMode: boolean) {
	await Preferences.set({
		key: 'darkMode',
		value: isDarkMode.toString()
	});
	document.documentElement.setAttribute('data-theme', isDarkMode ? 'dustynigh' : 'yellowsnow');
}
