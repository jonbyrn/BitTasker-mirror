import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { browser } from '$app/environment';

let splashScreenHidden = false;

export async function hideSplashScreen(options?: {
	fadeOutDuration?: number;
	force?: boolean;
}): Promise<void> {
	if (!browser) return;
	
	const { fadeOutDuration = 200, force = false } = options || {};
	
	if (splashScreenHidden && !force) {
		return;
	}
	
		try {
			if (Capacitor.isNativePlatform()) {
				await SplashScreen.hide({
					fadeOutDuration
				});
				splashScreenHidden = true;
			}
		} catch (error) {
			console.error('[SplashScreen] Error hiding splash screen:', error);
		}
}

export async function showSplashScreen(options?: {
	showDuration?: number;
	fadeInDuration?: number;
	autoHide?: boolean;
}): Promise<void> {
	if (!browser) return;
	
	const {
		showDuration = 0,
		fadeInDuration = 200,
		autoHide = false
	} = options || {};
	
	try {
		if (Capacitor.isNativePlatform()) {
			await SplashScreen.show({
				showDuration,
				fadeInDuration,
				autoHide
			});
			splashScreenHidden = false;
		}
	} catch (error) {
		console.error('[SplashScreen] Error showing splash screen:', error);
	}
}

export function isSplashScreenHidden(): boolean {
	return splashScreenHidden;
}

export async function hideSplashScreenWhenReady(delay: number = 300): Promise<void> {
	if (!browser) return;
	
	if (document.readyState === 'loading') {
		await new Promise<void>((resolve) => {
			document.addEventListener('DOMContentLoaded', () => resolve());
		});
	}
	
	if (delay > 0) {
		await new Promise(resolve => setTimeout(resolve, delay));
	}
	
	await hideSplashScreen();
}
