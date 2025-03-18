import { NativeBiometric } from 'capacitor-native-biometric';
import { encrypt, decrypt, deriveKeyFromPassword, generateEncryptionKeyFromUserId, exportKey } from '$lib/utils/helpers/crypto';
import { base64ToBytes, bytesToBase64 } from '$lib/utils/helpers/encoding';
import type { Credentials, EncryptedKeyData } from '$lib/types/auth';

export async function encryptNostrPrivateKeyWithUserId(
    nostrPrivateKey: string,
    userId: string
): Promise<EncryptedKeyData> {
    // Generate encryption key from user ID
    const userIdKey = await generateEncryptionKeyFromUserId(userId);
    
    // Encrypt with user ID key
    const userIdEncryption = await encrypt(nostrPrivateKey, userIdKey);
    
    // Export user ID key for storage
    const exportedUserIdKey = await exportKey(userIdKey);
    
    // Store the exported key securely using biometrics
    await NativeBiometric.setCredentials({
        username: 'nostr_key',
        password: exportedUserIdKey,
        server: 'com.bittasker.app'
    } as Credentials);
    
    return {
        data: userIdEncryption.encrypted,
        iv: userIdEncryption.iv
    };
}

export async function encryptNostrPrivateKeyWithPassword(
	nostrPrivateKey: string,
	recoveryPassword: string
): Promise<{ encrypted: EncryptedKeyData; salt: string }> {
	// Generate a random salt for recovery password
	const salt = crypto.getRandomValues(new Uint8Array(16));

	// Derive key from recovery password
	const recoveryKey = await deriveKeyFromPassword(recoveryPassword, salt);

	// Encrypt with recovery password
	const recoveryEncryption = await encrypt(nostrPrivateKey, recoveryKey);

	return {
		encrypted: {
			data: recoveryEncryption.encrypted,
			iv: recoveryEncryption.iv
		},
		salt: bytesToBase64(salt)
	};
}

export async function decryptNostrPrivateKeyWithUserId(
    encryptedData: EncryptedKeyData,
    userId: string
): Promise<string> {
    try {
        // Generate encryption key from user ID
        const key = await generateEncryptionKeyFromUserId(userId);
        
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
