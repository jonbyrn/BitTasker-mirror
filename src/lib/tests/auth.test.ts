import { describe, it, expect, vi } from 'vitest';
import { 
    encryptNostrPrivateKeyWithUserId,
    encryptNostrPrivateKeyWithPassword,
    decryptNostrPrivateKeyWithUserId,
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
    const mockUserId = 'user_123456789';
    const mockRecoveryPassword = 'test1-2TEST';
    const mockCredentials: Credentials = {
        username: 'nostr_key',
        password: 'mock-exported-key',
        server: 'com.bittasker.app'
    };
    
    it('should encrypt Nostr private key with user ID', async () => {
        const encryptedData = await encryptNostrPrivateKeyWithUserId(
            mockNostrPrivateKey,
            mockUserId
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
    
    it('should decrypt Nostr private key with user ID', async () => {
        vi.mocked(NativeBiometric.getCredentials).mockResolvedValue(mockCredentials);
        
        const mockEncryptedData = await encryptNostrPrivateKeyWithUserId(mockNostrPrivateKey, mockUserId);
        const decryptedKey = await decryptNostrPrivateKeyWithUserId(mockEncryptedData, mockUserId);
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
