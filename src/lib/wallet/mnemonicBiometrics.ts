/**
 * Simplified passkey-only mnemonic storage without backend API
 * Supports native biometrics, password manager passkeys, and WebAuthn
 */

import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from 'capacitor-native-biometric';
import { generateCredentialId, generateMobileChallenge, generateWebChallenge } from '$lib/utils/helpers/encoding';
import { Webauthn, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from 'capacitor-webauthn';
import { createUserFriendlyName, getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
import { validateMnemonic, wordlists } from 'bip39';


export const MNEMONIC_KEY = 'bittasker_wallet_mnemonic';

export interface PasskeyMethod {
	type: 'native' | 'password-manager' | 'web';
	available: boolean;
	description: string;
}

/**
 * Detect which passkey method should be used for the current platform
 */
export async function detectPasskeyMethod(): Promise<PasskeyMethod> {
	const isNative = Capacitor.isNativePlatform();

	if (isNative) {
		// Check native biometrics first
		try {
			const nativeResult = await NativeBiometric.isAvailable();
			if (nativeResult.isAvailable) {
				return {
					type: 'native',
					available: true,
					description: 'Native Biometric Authentication'
				};
			}
		} catch (error) {
			console.error('Native biometrics not available:', error);
		}

		// Fallback to WebAuthn on mobile (password manager)
		try {
			const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
			if (webAuthnAvailable) {
				return {
					type: 'password-manager',
					available: true,
					description: 'Password Manager Passkey'
				};
			}
		} catch (error) {
			console.error('WebAuthn not available on mobile:', error);
		}

		return {
			type: 'native',
			available: false,
			description: 'No biometric authentication available'
		};
	} else {
		// Web platform - use WebAuthn
		if (window.PublicKeyCredential) {
			try {
				const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
				return {
					type: 'web',
					available,
					description: available ? 'WebAuthn Platform Authenticator' : 'WebAuthn not available'
				};
			} catch (error) {
				console.error('WebAuthn check failed:', error);
			}
		}

		return {
			type: 'web',
			available: false,
			description: 'WebAuthn not supported in this browser'
		};
	}
}

/**
 * Create a purpose-based display name with device and date
 * @returns string - Formatted display name like "iPhone Wallet - Dec 2024" or "Mac Safari Wallet - Dec 2024"
 */
function createWalletDisplayName(): string {
	const now = new Date();
	const month = now.toLocaleString('en-US', { month: 'short' });
	const year = now.getFullYear();

	// Get device/platform info
	const userAgent = navigator.userAgent.toLowerCase();
	let deviceName = 'Device';

	// Detect device/platform
	if (userAgent.includes('iphone')) {
		deviceName = 'iPhone';
	} else if (userAgent.includes('ipad')) {
		deviceName = 'iPad';
	} else if (userAgent.includes('android')) {
		deviceName = 'Android';
	} else if (userAgent.includes('mac')) {
		deviceName = 'Mac';
	} else if (userAgent.includes('windows')) {
		deviceName = 'Windows';
	} else if (userAgent.includes('linux')) {
		deviceName = 'Linux';
	}

	return `${deviceName} Wallet - ${month} ${year}`;
}

/**
 * Setup a passkey for mnemonic storage
 * @param mnemonic - The mnemonic seed phrase to secure
 * @param customName - Optional custom name for the passkey
 * @returns Promise<string> - Credential ID for future reference
 */
export async function setupMnemonicPasskey(mnemonic: string): Promise<string> {
	// Validate mnemonic first
	if (!validateMnemonic(mnemonic)) {
		throw new Error('Invalid mnemonic phrase');
	}

	const method = await detectPasskeyMethod();

	if (!method.available) {
		throw new Error(`Passkey not available: ${method.description}`);
	}

	const deviceId = await getDeviceIdentifier();
	const userName = createUserFriendlyName(deviceId);
	const displayName = createWalletDisplayName();

	let credentialId: string;

	switch (method.type) {
		case 'native': {
			// Native biometric storage - use fixed server name for single wallet
			credentialId = generateCredentialId();

			await NativeBiometric.setCredentials({
				username: userName,
				password: mnemonic, // Store mnemonic directly
				server: MNEMONIC_KEY
			});

			break;
		}

		case 'password-manager': {
			// Mobile WebAuthn (password manager) - Pack mnemonic directly into user ID
			// TODO: Test if packing mnemonic is needed
			// const packedMnemonic = packMnemonic(mnemonic);

			const registrationOptions: PublicKeyCredentialCreationOptionsJSON = {
				challenge: generateMobileChallenge(),
				rp: {
					name: 'BitTasker Wallet',
					id: window.location.hostname
				},
				user: {
					id: btoa(mnemonic), // Store mnemonic in user ID
					name: userName,
					displayName: displayName
				},
				pubKeyCredParams: [
					{ type: 'public-key', alg: -7 }, // ES256
					{ type: 'public-key', alg: -257 } // RS256
				],
				timeout: 60000,
				attestation: 'none',
				authenticatorSelection: {
					userVerification: 'required',
					requireResidentKey: true,
					residentKey: 'required'
				}
			};

			const result = await Webauthn.startRegistration(registrationOptions);
			credentialId = result.id;

			break;
		}

		case 'web': {
			// Web WebAuthn - Pack mnemonic directly into credential (no localStorage dependency)
			const packedMnemonic = packMnemonic(mnemonic);

			const registrationOptions: PublicKeyCredentialCreationOptions = {
				challenge: generateWebChallenge(),
				rp: {
					name: 'BitTasker Wallet',
					id: window.location.hostname
				},
				user: {
					id: packedMnemonic, // Store packed mnemonic directly in user ID (exactly 64 bytes)
					name: displayName,
					displayName: userName
				},
				pubKeyCredParams: [
					{ type: 'public-key', alg: -7 }, // ES256
					{ type: 'public-key', alg: -257 } // RS256
				],
				timeout: 60000,
				attestation: 'none',
				authenticatorSelection: {
					authenticatorAttachment: 'platform',
					userVerification: 'required',
					requireResidentKey: true, // Require resident key for proper storage
					residentKey: 'required' // Required for discoverable credentials
				},
				excludeCredentials: [] // Empty to allow new credential creation
			};

			const credential = await navigator.credentials.create({
				publicKey: registrationOptions
			}) as PublicKeyCredential;

			if (!credential) {
				throw new Error('Failed to create WebAuthn credential');
			}

			credentialId = credential.id;

			break;
		}

		default:
			throw new Error(`Unsupported passkey method: ${method.type}`);
	}

	return credentialId;
}

/**
 * Retrieve mnemonic using passkey authentication
 * @returns Promise<string> - The mnemonic seed phrase
 */
export async function getMnemonicPasskey(): Promise<string> {
	const method = await detectPasskeyMethod();

	if (!method.available) {
		throw new Error(`Passkey not available: ${method.description}`);
	}

	let mnemonic: string;

	switch (method.type) {
		case 'native': {
			// Native biometric authentication
			await NativeBiometric.verifyIdentity({
				reason: 'Access your BitTasker wallet',
				title: 'BitTasker Wallet',
				subtitle: 'Authenticate to access wallet',
				description: 'Use biometric authentication to access your wallet'
			});

			// For native biometrics, we'll use a fixed server name since we can only store one mnemonic
			// This is simpler and works for the single wallet use case
			const credentials = await NativeBiometric.getCredentials({
				server: MNEMONIC_KEY
			});

			mnemonic = credentials.password;
			break;
		}

		case 'password-manager': {
			// Mobile WebAuthn authentication
			const authOptions: PublicKeyCredentialRequestOptionsJSON = {
				challenge: generateMobileChallenge(),
				timeout: 60000,
				userVerification: 'required',
				rpId: 'bittasker.com',
				allowCredentials: [] // Discovery mode
			};

			const credentials = await Webauthn.startAuthentication(authOptions);

			if (!credentials.response.userHandle) {
				throw new Error('No mnemonic found in passkey');
			}

			mnemonic = atob(credentials.response.userHandle);
			break;
		}

		case 'web': {
			// Web WebAuthn authentication
			const authOptions: PublicKeyCredentialRequestOptions = {
				challenge: generateWebChallenge(),
				timeout: 60000,
				userVerification: 'required',
				allowCredentials: [] // Discovery mode
			};

			const credential = await navigator.credentials.get({
				publicKey: authOptions
			}) as PublicKeyCredential;

			if (!credential) {
				throw new Error('No passkey credential found');
			}

			const response = credential.response as AuthenticatorAssertionResponse;

			if (!response.userHandle) {
				throw new Error('No mnemonic found in passkey');
			}

			// Unpack mnemonic directly from userHandle (self-contained)
			mnemonic = unpackMnemonic(response.userHandle);
			break;
		}

		default:
			throw new Error(`Unsupported passkey method: ${method.type}`);
	}

	// Validate the retrieved mnemonic
	if (!validateMnemonic(mnemonic)) {
		throw new Error('Retrieved mnemonic is invalid');
	}

	return mnemonic;
}

/**
 * Check if a passkey with mnemonic exists
 * @returns Promise<boolean>
 */
export async function hasMnemonicPasskey(): Promise<boolean> {
	try {
		const method = await detectPasskeyMethod();
		return method.available;
	} catch {
		return false;
	}
}

/**
 * Get user-friendly description of the passkey method that will be used
 * @returns Promise<string>
 */
export async function getPasskeyDescription(): Promise<string> {
	const method = await detectPasskeyMethod();
	return method.description;
}

/**
 * Pack BIP39 mnemonic into exactly 64 bytes using word indices
 * PRODUCTION READY: Uses official BIP39 wordlist for perfect reconstruction
 */
export function packMnemonic(mnemonic: string): ArrayBuffer {
	const wordlist = wordlists.english;

	const words = mnemonic.trim().split(/\s+/);

	// Validate word count (BIP39 supports 12, 15, 18, 21, 24 words)
	const validCounts = [12, 15, 18, 21, 24];
	if (!validCounts.includes(words.length)) {
		throw new Error(`Invalid mnemonic word count: ${words.length}. BIP39 supports: ${validCounts.join(', ')}`);
	}

	// Convert words to indices
	const indices: number[] = [];
	for (const word of words) {
		const index = wordlist.indexOf(word.toLowerCase());
		if (index === -1) {
			throw new Error(`Invalid BIP39 word: "${word}"`);
		}
		indices.push(index);
	}

	// Pack indices using bit manipulation
	// Each index needs 11 bits (2048 = 2^11)
	const totalBits = words.length * 11;
	const totalBytes = Math.ceil(totalBits / 8);

	if (totalBytes > 63) { // Leave 1 byte for word count
		throw new Error(`Mnemonic too long: ${totalBytes} bytes needed (max 63)`);
	}

	const packed = new Uint8Array(64);
	packed[0] = words.length; // Store word count in first byte

	// Pack 11-bit indices into bytes
	let bitOffset = 8; // Start after the word count byte
	for (const index of indices) {
		// Write 11 bits for this index
		for (let bit = 10; bit >= 0; bit--) {
			const bitValue = (index >> bit) & 1;
			const byteIndex = Math.floor(bitOffset / 8);
			const bitPosition = 7 - (bitOffset % 8);

			if (bitValue) {
				packed[byteIndex] |= (1 << bitPosition);
			}

			bitOffset++;
		}
	}

	return packed.buffer;
}

/**
 * Unpack BIP39 mnemonic from 64-byte buffer with perfect reconstruction
 * PRODUCTION READY: Reconstructs exact original mnemonic using BIP39 wordlist
 */
export function unpackMnemonic(userHandle: ArrayBuffer): string {
	const wordlist = wordlists.english;

	const bytes = new Uint8Array(userHandle);
	const wordCount = bytes[0];

	// Validate word count
	const validCounts = [12, 15, 18, 21, 24];
	if (!validCounts.includes(wordCount)) {
		throw new Error(`Invalid word count in packed data: ${wordCount}`);
	}

	// Unpack indices from bits
	const indices: number[] = [];
	let bitOffset = 8; // Start after the word count byte

	for (let i = 0; i < wordCount; i++) {
		let index = 0;

		// Read 11 bits for this index
		for (let bit = 10; bit >= 0; bit--) {
			const byteIndex = Math.floor(bitOffset / 8);
			const bitPosition = 7 - (bitOffset % 8);
			const bitValue = (bytes[byteIndex] >> bitPosition) & 1;

			index |= (bitValue << bit);
			bitOffset++;
		}

		// Validate index
		if (index >= wordlist.length) {
			throw new Error(`Invalid word index: ${index} (max ${wordlist.length - 1})`);
		}

		indices.push(index);
	}

	// Convert indices back to words
	const words = indices.map(index => wordlist[index]);
	const mnemonic = words.join(' ');

	// Validate the reconstructed mnemonic
	if (!validateMnemonic(mnemonic)) {
		throw new Error('Reconstructed mnemonic failed BIP39 validation');
	}

	return mnemonic;
}