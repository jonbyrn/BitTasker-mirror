import type { Credentials, EncryptedKeyData } from '$lib/types/auth';
import { checkBiometricAvailability } from './biometrics';
import { NativeBiometric } from 'capacitor-native-biometric';
import { base64ToBytes, bytesToBase64 } from '$lib/utils/helpers/encoding';
import { encrypt, decrypt, deriveKeyFromPassword, generateEncryptionKeyFromUserId, exportKey } from '$lib/utils/helpers/crypto';

export async function encryptNostrPrivateKeyWithUserId(
    nostrPrivateKey: string,
    userId: string
): Promise<{ encrypted: EncryptedKeyData; salt: string }> {
    // Generate a random salt
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltBase64 = bytesToBase64(salt);
    
    // Generate encryption key from user ID and salt
    const userIdKey = await generateEncryptionKeyFromUserId(userId, salt);
    
    // Encrypt with user ID key
    const userIdEncryption = await encrypt(nostrPrivateKey, userIdKey);
    
    // Export user ID key for storage
    const exportedUserIdKey = await exportKey(userIdKey);
    
    // Store the exported key securely using biometrics
    const isBiometricAvailable = await checkBiometricAvailability();
    if (isBiometricAvailable) {
        await NativeBiometric.setCredentials({
            username: 'nostr_key',
            password: exportedUserIdKey,
            server: 'com.bittasker.app'
        } as Credentials);
    }
    
    return {
        encrypted: {
            data: userIdEncryption.encrypted,
            iv: userIdEncryption.iv
        },
        salt: saltBase64
    };
}

export async function encryptNostrPrivateKeyWithPassword(
	nostrPrivateKey: string,
	recoveryPassword: string
): Promise<{ encrypted: EncryptedKeyData; salt: string }> {
	// Generate a random salt for recovery password
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const saltBase64 = bytesToBase64(salt);

	// Derive key from recovery password
	const recoveryKey = await deriveKeyFromPassword(recoveryPassword, salt);
	// Encrypt with recovery password key
	const recoveryEncryption = await encrypt(nostrPrivateKey, recoveryKey);
    // Export recovery key for storage
    const exportedRecoveryKey = await exportKey(recoveryKey);

    // Store the exported key securely using biometrics
    const isBiometricAvailable = await checkBiometricAvailability();
    if (isBiometricAvailable) {
        await NativeBiometric.setCredentials({
            username: 'recovery_key',
            password: exportedRecoveryKey,
            server: 'com.bittasker.app'
        } as Credentials);
    }

	return {
		encrypted: {
			data: recoveryEncryption.encrypted,
			iv: recoveryEncryption.iv
		},
		salt: saltBase64
	};
}

export async function decryptNostrPrivateKeyWithUserId(
    encryptedData: EncryptedKeyData,
    salt: string,
    userId: string
): Promise<string> {
    try {
        // Generate encryption key from user ID and salt
        const key = await generateEncryptionKeyFromUserId(userId, base64ToBytes(salt));
        
        // Decrypt using the helper function
        return await decrypt(encryptedData.data, encryptedData.iv, key);
    } catch (error) {
        console.log('Decryption error:', error);
        throw new Error('Failed to decrypt Nostr private key with user ID');
    }
}

export async function decryptNostrPrivateKeyWithRecovery(
	encryptedData: EncryptedKeyData,
	salt: string,
	recoveryPassword: string
): Promise<string> {
	try {
		// Derive the recovery key
		const recoveryKey = await deriveKeyFromPassword(recoveryPassword, base64ToBytes(salt));

		// Decrypt the private key
		return await decrypt(encryptedData.data, encryptedData.iv, recoveryKey);
	} catch (error) {
		throw new Error('Failed to decrypt Nostr private key with recovery password');
	}
}

export async function generateLoginChallenge() {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	const challenge = Array.from(array)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return {
		challenge,
		message: `Sign this message to login: ${challenge}`
	};
}
