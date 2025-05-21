import type { Credentials } from '$lib/types/auth';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { hexToBytes } from '@noble/hashes/utils';
import { decryptNsecWithBiometrics } from '$lib/utils/helpers/auth';
import { Preferences } from '@capacitor/preferences';
import { nip19 } from 'nostr-tools';

export const getNostrKeyPair = async (): Promise<{ nsec: Uint8Array; npub: string }> => {
	const currentState = get(appStore);

	if (currentState.biometricData) {
		const sk = await decryptNsecWithBiometrics(currentState.biometricData.password);
		const nsecSk = sk;
		let nsec: Uint8Array;
		if (nsecSk.startsWith('nsec')) {
			const decoded = nip19.decode(nsecSk).data;
			if (decoded instanceof Uint8Array) {
				nsec = decoded;
			} else if (typeof decoded === 'string') {
				nsec = hexToBytes(decoded);
			} else {
				throw new Error('Invalid nsec format');
			}
		} else {
			nsec = hexToBytes(nsecSk);
		}
		const npub = currentState.biometricData.username;
		await Preferences.set({ key: 'npub', value: npub });
		return { nsec, npub };
	}

	let biometricData: Credentials | null = null;

	const { checkBiometricAvailability, getBiometricData } = await import(
		'$lib/utils/helpers/biometrics'
	);

	const isBiometricAvailable = await checkBiometricAvailability();

	if (isBiometricAvailable) {
		biometricData = await getBiometricData();
		appStore.update((state) => ({ ...state, biometricData }));
	} else {
		const { getWebBiometricData } = await import('$lib/utils/helpers/webBiometrics');
		biometricData = await getWebBiometricData();
		appStore.update((state) => ({ ...state, biometricData }));
	}

	if (!biometricData) {
		throw new Error('No biometric data found');
	}

	const sk = await decryptNsecWithBiometrics(biometricData.password);
	const nsecSk = sk;
	let nsec: Uint8Array;
	if (nsecSk.startsWith('nsec')) {
		const decoded = nip19.decode(nsecSk).data;
		if (decoded instanceof Uint8Array) {
			nsec = decoded;
		} else if (typeof decoded === 'string') {
			nsec = hexToBytes(decoded);
		} else {
			throw new Error('Invalid nsec format');
		}
	} else {
		nsec = hexToBytes(nsecSk);
	}
	const npub = biometricData.username;
	await Preferences.set({ key: 'npub', value: npub });
	return { nsec, npub };
};

export const getNpub = async (): Promise<string> => {
	const { value } = await Preferences.get({ key: 'npub' });

	if (value) {
		return value;
	}

	const currentState = get(appStore);

	if (currentState.biometricData) {
		const npub = currentState.biometricData.username;
		await Preferences.set({ key: 'npub', value: npub });
		return npub;
	}

	let biometricData: Credentials | null = null;

	const { checkBiometricAvailability, getBiometricData } = await import(
		'$lib/utils/helpers/biometrics'
	);

	const isBiometricAvailable = await checkBiometricAvailability();

	if (isBiometricAvailable) {
		biometricData = await getBiometricData();
		appStore.update((state) => ({ ...state, biometricData }));
	} else {
		const { getWebBiometricData } = await import('$lib/utils/helpers/webBiometrics');
		biometricData = await getWebBiometricData();
		appStore.update((state) => ({ ...state, biometricData }));
	}

	if (!biometricData) {
		throw new Error('No biometric data found');
	}

	const npub = biometricData.username;
	await Preferences.set({ key: 'npub', value: npub });
	return npub;
};
