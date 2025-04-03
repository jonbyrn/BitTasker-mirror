import { type DeviceInfo, Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { writable } from 'svelte/store';

export const deviceInfo = writable<DeviceInfo | null>(null);

export const onboardingCompleted = writable<boolean>(true);

export const getOnboardingCompleted = async () => {
	const { value } = await Preferences.get({ key: StorageKeys.ONBOARDING_COMPLETED });
	onboardingCompleted.set(value === 'true');
};

export const getDeviceInfo = async () => {
	const info = await Device.getInfo();
	deviceInfo.set(info);
};
