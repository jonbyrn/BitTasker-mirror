import { type DeviceInfo, Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { writable } from 'svelte/store';

export const deviceInfo = writable<DeviceInfo | null>(null);

export const onboardingCompleted = writable<boolean>(true);

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

export const getDeviceInfo = async () => {
	// Defer to prevent blocking main thread
	const deferOperation = () => {
		if ('requestIdleCallback' in window) {
			requestIdleCallback(async () => {
				const info = await Device.getInfo();
				deviceInfo.set(info);
			}, { timeout: 1000 });
		} else {
			setTimeout(async () => {
				const info = await Device.getInfo();
				deviceInfo.set(info);
			}, 100);
		}
	};
	
	deferOperation();
};
