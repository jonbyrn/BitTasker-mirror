import { writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { StorageKeys } from '$lib/utils/constants/storage';

// Simple device platform detection without WebAuthn conflicts
export const devicePlatform = writable<string>('web');
export const onboardingCompleted = writable<boolean>(true);

// Initialize device platform detection using Capacitor's reliable platform detection
export const initializeDevicePlatform = async () => {
	try {
		// Use Capacitor's built-in platform detection - this is safe and doesn't conflict with WebAuthn
		const platform = Capacitor.getPlatform();
		
		// Capacitor.getPlatform() returns 'ios', 'android', or 'web'
		devicePlatform.set(platform);
		
		console.log('Device platform detected:', platform);
	} catch (error) {
		console.error('Error detecting device platform:', error);
		// Fallback to user agent detection if Capacitor fails
		const userAgent = navigator.userAgent.toLowerCase();
		let fallbackPlatform = 'web';
		
		if (/android/.test(userAgent)) {
			fallbackPlatform = 'android';
		} else if (/iphone|ipad|ipod/.test(userAgent)) {
			fallbackPlatform = 'ios';
		}
		
		devicePlatform.set(fallbackPlatform);
	}
};

// Get onboarding status
export const getOnboardingCompleted = async () => {
	// Defer to prevent blocking main thread
	const deferOperation = () => {
		if ('requestIdleCallback' in window) {
			requestIdleCallback(async () => {
				const { value } = await Preferences.get({ key: StorageKeys.ONBOARDING_COMPLETED });
				onboardingCompleted.set(value === 'true');
			}, { timeout: 1000 });
		} else {
			setTimeout(async () => {
				const { value } = await Preferences.get({ key: StorageKeys.ONBOARDING_COMPLETED });
				onboardingCompleted.set(value === 'true');
			}, 100);
		}
	};
	
	deferOperation();
};
