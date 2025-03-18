import { Device, type DeviceInfo } from '@capacitor/device';
import { writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';

export const deviceInfo = writable<DeviceInfo | null>(await Device.getInfo());

export const onboardingCompleted = writable<boolean>(
	await Preferences.get({ key: 'onboardingCompleted' }).then(({ value }) => value === 'true')
);
