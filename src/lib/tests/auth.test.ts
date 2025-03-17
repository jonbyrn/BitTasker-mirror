import { describe, it, expect, vi } from 'vitest';
import { 
    encryptNostrPrivateKeyWithToken,
    encryptNostrPrivateKeyWithPassword,
    decryptNostrPrivateKeyWithAccessToken,
    decryptNostrPrivateKeyWithRecovery
} from '$lib/utils/helpers/auth';
import { NativeBiometric } from 'capacitor-native-biometric';
import type { Credentials } from '$lib/types/auth';

vi.mock('capacitor-native-biometric', () => ({
    NativeBiometric: {
        setCredentials: vi.fn(),
        getCredentials: vi.fn()
    }
}));

describe('Nostr Key Encryption', () => {
    const mockNostrPrivateKey = "8e1ef72c2da4cf2993ed43fbc059f7a2a6b61de21d706d8fa48ca91b7ceef05f";
	const mockAccessToken = 'ya29.a0AfH6SMC8GQ0lLwG2O8X5rYJqN3LwE7aH8PqQ7JXZ0lGzB7hT6Z3O0mY9KdDqXj9yO5E8rGvT1Jm0KvY2N3XoV5RzY4U2M';
    const mockRecoveryPassword = 'test1-2TEST';
    const mockCredentials: Credentials = {
        username: 'nostr_key',
        password: 'mock-exported-key',
        server: 'com.bittasker.app'
    };
    
    it('should encrypt Nostr private key with access token', async () => {
        const encryptedData = await encryptNostrPrivateKeyWithToken(
            mockNostrPrivateKey,
            mockAccessToken
        );
        
        expect(encryptedData).toHaveProperty('data');
        expect(encryptedData).toHaveProperty('iv');
        expect(typeof encryptedData.data).toBe('string');
        expect(typeof encryptedData.iv).toBe('string');
    });

    it('should encrypt Nostr private key with recovery password', async () => {
        const result = await encryptNostrPrivateKeyWithPassword(
            mockNostrPrivateKey,
            mockRecoveryPassword
        );
        
        expect(result).toHaveProperty('encrypted');
        expect(result).toHaveProperty('salt');
        expect(result.encrypted).toHaveProperty('data');
        expect(result.encrypted).toHaveProperty('iv');
        expect(typeof result.salt).toBe('string');
    });
    
    it('should decrypt Nostr private key with access token', async () => {
        vi.mocked(NativeBiometric.getCredentials).mockResolvedValue(mockCredentials);
        
        const mockEncryptedData = await encryptNostrPrivateKeyWithToken(mockNostrPrivateKey, mockAccessToken);
        const decryptedKey = await decryptNostrPrivateKeyWithAccessToken(mockEncryptedData, mockAccessToken);
        expect(decryptedKey).toBe(mockNostrPrivateKey);
    });
    
    it('should decrypt Nostr private key with recovery password', async () => {
        const result = await encryptNostrPrivateKeyWithPassword(
            mockNostrPrivateKey,
            mockRecoveryPassword
        );
        
        const decryptedKey = await decryptNostrPrivateKeyWithRecovery(
            result.encrypted,
            result.salt,
            mockRecoveryPassword
        );
        expect(decryptedKey).toBe(mockNostrPrivateKey);
    });
    
    it('should fail to decrypt with wrong recovery password', async () => {
        const result = await encryptNostrPrivateKeyWithPassword(
            mockNostrPrivateKey,
            mockRecoveryPassword
        );
        
        await expect(
            decryptNostrPrivateKeyWithRecovery(
                result.encrypted,
                result.salt,
                'wrong-password'
            )
        ).rejects.toThrow('Failed to decrypt Nostr private key with recovery password');
    });
});