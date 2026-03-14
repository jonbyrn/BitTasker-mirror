import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { initializeStatusBar } from '$lib/utils/helpers/statusBar';
import { initializeSplashScreen } from '$lib/utils/helpers/splashScreen';
import { initDebug } from '$lib/utils/debug';

export const prerender = true;
export const ssr = false;
export const csr = true;

// Initialize debug tools early
initDebug();

export const load: LayoutLoad = async () => {
	if (browser) {
		await initializeSplashScreen();
		await initializeStatusBar();
	}

	return {};
};
