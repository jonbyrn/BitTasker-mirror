import { bytesToHex } from '@noble/hashes/utils';
import { Capacitor } from '@capacitor/core';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import authService from '$lib/api/services/auth.service';
import { appStore } from '$lib/stores/app.store';
import type { EncryptedData } from '$lib/types/auth';
import { decryptMasterKeyDataFromBiometrics } from '$lib/utils/helpers/auth';
import { deriveKeyFromPassword, deriveWalletFromNostr, exportKey } from '$lib/utils/helpers/crypto';
import { createUserDeviceShortName, getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
import { base64ToBytes } from '$lib/utils/helpers/encoding';
import { decodeNsec } from '$lib/utils/nostr';
import {
	readMnemonicSession,
	readSignerSession,
	saveMnemonicSession,
	saveSignerSession
} from './session-mnemonic';
import { storedAccountNpub, walletUnlockRoute } from './login-method';
import { get } from 'svelte/store';

export class NsecUnlockRequired extends Error {
	constructor() {
		super('Enter your nsec to unlock this wallet');
		this.name = 'NsecUnlockRequired';
	}
}

export function isNsecUnlockRequired(error: unknown): boolean {
	return error instanceof NsecUnlockRequired;
}

function sameAccount(stored: string, hex: string): boolean {
	if (!stored) return true;
	if (stored === hex) return true;
	if (!stored.startsWith('npub1')) return false;
	try {
		const decoded = nip19.decode(stored);
		return decoded.type === 'npub' && decoded.data === hex;
	} catch {
		return false;
	}
}

async function mnemonicFromAccount(raw: string, privateKey: Uint8Array): Promise<string> {
	const npub = getPublicKey(privateKey);
	const { challenge } = await authService.getChallenge();
	const signedEvent = finalizeEvent(
		{
			kind: 22242,
			created_at: Math.floor(Date.now() / 1000),
			content: challenge,
			tags: [
				['relay', typeof window === 'undefined' ? '' : window.location.origin],
				['challenge', challenge]
			]
		},
		privateKey
	);
	const response = await authService.encryptedNostrData({
		event: signedEvent,
		deviceId: await getDeviceIdentifier(),
		deviceName: await createUserDeviceShortName(npub),
		platform: Capacitor.isNativePlatform() ? 'mobile' : 'web',
		appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
	});
	const encrypted = response?.encryptedData;
	if (!encrypted) return deriveWalletFromNostr(raw);

	const legacy = encrypted as EncryptedData & { exportedMasterKey?: string };
	if (legacy.exportedMasterKey) {
		const decrypted = await decryptMasterKeyDataFromBiometrics(encrypted, legacy.exportedMasterKey);
		return decrypted.mnemonic;
	}

	const masterSalt = base64ToBytes(encrypted.masterSalt);
	const passwords = raw.startsWith('nsec1') ? [bytesToHex(privateKey), raw] : [raw];
	let lastError: unknown;
	for (const password of passwords) {
		try {
			const masterKey = await deriveKeyFromPassword(password, masterSalt, 100000);
			const exported = await exportKey(masterKey);
			const decrypted = await decryptMasterKeyDataFromBiometrics(encrypted, exported);
			return decrypted.mnemonic;
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError instanceof Error ? lastError : new Error('This key could not open the wallet');
}

/** Rebuild the wallet seed from a pasted or session-stored nsec. Never calls WebAuthn. */
export async function recoverMnemonicFromNsec(raw: string): Promise<string> {
	const trimmed = raw.trim();
	if (!trimmed) throw new NsecUnlockRequired();

	const privateKey = decodeNsec(trimmed);
	const npub = getPublicKey(privateKey);
	if (!sameAccount(storedAccountNpub(), npub)) {
		throw new Error('This key does not match the signed-in account');
	}

	const mnemonic = await mnemonicFromAccount(trimmed, privateKey);
	appStore.update((state) => ({
		...state,
		nostrKeys: { ...state.nostrKeys, nsec: privateKey, npub, mnemonic }
	}));
	await saveMnemonicSession(mnemonic).catch(() => undefined);
	await saveSignerSession(trimmed, npub).catch(() => undefined);
	if (import.meta.env.MODE !== 'test') {
		const { applyNdkSignerFromNsec } = await import('$lib/nostr/ndk');
		await applyNdkSignerFromNsec(privateKey).catch(() => undefined);
	}
	return mnemonic;
}

/** Put a restarted nsec session back in memory. Does not call WebAuthn. */
export async function restorePersistedNsecSession(): Promise<boolean> {
	if (walletUnlockRoute() !== 'nsec') return false;
	const current = get(appStore);
	if (current.nostrKeys.nsec && current.nostrKeys.npub) return true;
	const signer = await readSignerSession().catch(() => null);
	if (!signer?.nsec || !signer.npub) return false;
	try {
		const privateKey = decodeNsec(signer.nsec);
		const mnemonic = await readMnemonicSession().catch(() => null);
		appStore.update((state) => ({
			...state,
			nostrKeys: {
				...state.nostrKeys,
				nsec: privateKey,
				npub: signer.npub,
				mnemonic: mnemonic ?? state.nostrKeys.mnemonic
			}
		}));
		if (import.meta.env.MODE !== 'test') {
			const { applyNdkSignerFromNsec } = await import('$lib/nostr/ndk');
			await applyNdkSignerFromNsec(privateKey).catch(() => undefined);
		}
		return true;
	} catch {
		return false;
	}
}
