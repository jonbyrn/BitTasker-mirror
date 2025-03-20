import type { Credentials } from '$lib/types/auth';
import { goto } from '$app/navigation';
import { NativeBiometric } from 'capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';

export const checkBiometricAvailability = async () => {
	const isNative = Capacitor.isNativePlatform();
	if (!isNative) return false;
	const result = await NativeBiometric.isAvailable();
	return result.isAvailable;
};

export function verifyIdentity() {
	NativeBiometric.verifyIdentity({
		reason: 'For easy log in',
		title: 'Log in',
		subtitle: 'Authenticate',
		description: 'Please authenticate to proceed',
		maxAttempts: 2,
		useFallback: true
	})
		.then((user) => {
			console.log(user);
			goto('profile');
		})
		.catch((err: any) => {
			console.error(err);
		});
}

export function createPasskey(email: string) {
	NativeBiometric.setCredentials({
		username: email,
		password: '',
		server: 'com.bittasker.app'
	} as Credentials);
	verifyIdentity();
}

export async function getCredentials(): Promise<Credentials> {
	const credentials = (await NativeBiometric.getCredentials({
		server: 'com.bittasker.app'
	})) as Credentials;
	return credentials;
}
