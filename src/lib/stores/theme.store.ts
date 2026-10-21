import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { writable } from 'svelte/store';

/** Same key Capacitor Preferences writes on the web. The head script reads it before paint. */
export const THEME_LOCAL_KEY = `CapacitorStorage.${StorageKeys.THEME}`;

function systemPrefersDark(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readSavedTheme(): boolean | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const saved = localStorage.getItem(THEME_LOCAL_KEY);
		if (saved === 'true') return true;
		if (saved === 'false') return false;
	} catch {
		// Private mode can block localStorage. Preferences still has the choice.
	}
	return null;
}

function writeSavedTheme(isDarkMode: boolean) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(THEME_LOCAL_KEY, isDarkMode ? 'true' : 'false');
	} catch {
		// Preferences.set still persists the choice.
	}
}

export function applyDocumentTheme(isDarkMode: boolean) {
	if (typeof document === 'undefined') return;
	const theme = isDarkMode ? 'dark' : 'light';
	const root = document.documentElement;
	root.setAttribute('data-theme', theme);
	root.style.colorScheme = theme;
	root.classList.toggle('dark', isDarkMode);
}

const getInitialTheme = (): boolean => readSavedTheme() ?? systemPrefersDark();

export const darkMode = writable<boolean>(getInitialTheme());

if (typeof document !== 'undefined') {
	applyDocumentTheme(getInitialTheme());
}

let systemMedia: MediaQueryList | null = null;
let systemListener: ((event: MediaQueryListEvent) => void) | null = null;

function followSystemTheme() {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
	const media = window.matchMedia('(prefers-color-scheme: dark)');
	if (systemMedia && systemListener) {
		systemMedia.removeEventListener('change', systemListener);
	}
	systemListener = (event) => {
		if (readSavedTheme() !== null) return;
		darkMode.set(event.matches);
		applyDocumentTheme(event.matches);
	};
	systemMedia = media;
	media.addEventListener('change', systemListener);
}

function paintTheme(isDarkMode: boolean) {
	const apply = () => applyDocumentTheme(isDarkMode);
	if (typeof document !== 'undefined' && 'startViewTransition' in document) {
		try {
			(
				document as Document & { startViewTransition: (cb: () => void) => ViewTransition }
			).startViewTransition(apply);
			return;
		} catch {
			apply();
			return;
		}
	}
	apply();
}

// Initialize theme from saved preference (called from layout)
export async function initializeTheme() {
	if (typeof window === 'undefined') return;

	try {
		const { value: savedDarkMode } = await Preferences.get({ key: StorageKeys.THEME });

		if (savedDarkMode === 'true' || savedDarkMode === 'false') {
			const isDark = savedDarkMode === 'true';
			writeSavedTheme(isDark);
			darkMode.set(isDark);
			applyDocumentTheme(isDark);
			return;
		}

		const isDark = systemPrefersDark();
		darkMode.set(isDark);
		applyDocumentTheme(isDark);
		followSystemTheme();
	} catch (error) {
		console.warn('Failed to load theme preference:', error);
		applyDocumentTheme(readSavedTheme() ?? systemPrefersDark());
	}
}

// Toggle dark mode and persist
export async function toggleDarkMode() {
	let next = false;
	darkMode.update((current) => {
		next = !current;
		return next;
	});
	writeSavedTheme(next);
	paintTheme(next);
	await persistTheme(next);
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
