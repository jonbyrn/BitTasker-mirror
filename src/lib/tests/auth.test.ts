import { describe, it, expect, vi } from 'vitest';
import {
	encryptNsec,
	decryptNsecWithBiometrics,
	decryptNsecWithPassword,
	generateLoginChallenge,
	signLoginChallenge
} from '$lib/utils/helpers/auth';
import { NativeBiometric } from 'capacitor-native-biometric';
import type { Credentials, EncryptedData } from '$lib/types/auth';

vi.mock('capacitor-native-biometric', () => ({
	NativeBiometric: {
		setCredentials: vi.fn(),
		getCredentials: vi.fn()
	}
}));

describe('Nostr Key Encryption', () => {
	const mockNostrPrivateKey = '8e1ef72c2da4cf2993ed43fbc059f7a2a6b61de21d706d8fa48ca91b7ceef05f';
	const mockUserId = 'user_123456789';
	const mockRecoveryPassword = 'test1-2TEST';
	const mockEncryptionData = {
		data: 'mockEncryptedData',
		iv: 'mockIvData',
		authTag: 'mockAuthTagData',
		key: 'mockKeyData',
		salt: 'mockSaltData'
	};

	it('should encrypt Nostr private key with password', async () => {
		const result = await encryptNsec(
			mockNostrPrivateKey,
			mockRecoveryPassword
		);

		expect(result).toHaveProperty('encrypted');
		expect(result).toHaveProperty('salt');
		expect(result).toHaveProperty('exportedKey');
		expect(result).toHaveProperty('iterations');
		expect(result.encrypted).toHaveProperty('data');
		expect(result.encrypted).toHaveProperty('iv');
		expect(result.encrypted).toHaveProperty('authTag');
		expect(typeof result.salt).toBe('string');
	});

	it('should decrypt private key with biometrics', async () => {
		// Mock implementation for decryptNsecWithBiometrics
		// This implementation bypasses the normal biometric checks
		const mockEncryptedDataString = JSON.stringify(mockEncryptionData);
		
		// Use vi.spyOn to mock the implementation of the imported function
		const decryptSpy = vi.spyOn(await import('$lib/utils/helpers/crypto'), 'decrypt')
			.mockResolvedValue(mockNostrPrivateKey);
		
		const importKeySpy = vi.spyOn(await import('$lib/utils/helpers/crypto'), 'importKey')
			.mockResolvedValue({} as CryptoKey);
		
		const decryptedKey = await decryptNsecWithBiometrics(mockEncryptedDataString);
		
		expect(decryptedKey).toBe(mockNostrPrivateKey);
		expect(importKeySpy).toHaveBeenCalled();
		expect(decryptSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				data: mockEncryptionData.data,
				iv: mockEncryptionData.iv,
				authTag: mockEncryptionData.authTag
			}),
			expect.anything()
		);
		
		// Restore original implementations
		decryptSpy.mockRestore();
		importKeySpy.mockRestore();
	});

	it('should decrypt private key with password', async () => {
		const mockEncryptParams = {
			encryptedPrivateKey: 'mockEncryptedData',
			iv: 'mockIvData',
			authTag: 'mockAuthTagData',
			password: mockRecoveryPassword,
			salt: 'mockSaltData',
			iterations: 100000
		};
		
		// Mock the dependency functions
		const deriveKeySpy = vi.spyOn(await import('$lib/utils/helpers/crypto'), 'deriveKeyFromPassword')
			.mockResolvedValue({} as CryptoKey);
		
		const decryptSpy = vi.spyOn(await import('$lib/utils/helpers/crypto'), 'decrypt')
			.mockResolvedValue(mockNostrPrivateKey);
		
		const decryptedKey = await decryptNsecWithPassword(mockEncryptParams);
		
		expect(decryptedKey).toBe(mockNostrPrivateKey);
		expect(deriveKeySpy).toHaveBeenCalled();
		expect(decryptSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				data: mockEncryptParams.encryptedPrivateKey,
				iv: mockEncryptParams.iv,
				authTag: mockEncryptParams.authTag
			}),
			expect.anything()
		);
		
		// Restore original implementations
		deriveKeySpy.mockRestore();
		decryptSpy.mockRestore();
	});

	it('should generate a login challenge', async () => {
		const challenge = await generateLoginChallenge();
		
		expect(challenge).toHaveProperty('challenge');
		expect(challenge).toHaveProperty('message');
		expect(typeof challenge.challenge).toBe('string');
		expect(challenge.challenge.length).toBe(64); // 32 bytes as hex = 64 chars
		expect(challenge.message).toContain(challenge.challenge);
	});

	it('should sign a login challenge with a private key', async () => {
		const challenge = { challenge: 'abcdef1234567890', message: 'Sign this message: abcdef1234567890' };
		
		const signature = await signLoginChallenge(challenge.challenge, mockNostrPrivateKey);
		
		expect(typeof signature).toBe('string');
		expect(signature.length).toBeGreaterThan(0);
	});
	
	it('should fail to decrypt with wrong password', async () => {
		const mockEncryptParams = {
			encryptedPrivateKey: 'mockEncryptedData',
			iv: 'mockIvData',
			authTag: 'mockAuthTagData',
			password: 'wrongPassword',
			salt: 'mockSaltData',
			iterations: 100000
		};
		
		// Mock to throw an error on decrypt
		vi.spyOn(await import('$lib/utils/helpers/crypto'), 'deriveKeyFromPassword')
			.mockResolvedValue({} as CryptoKey);
		
		vi.spyOn(await import('$lib/utils/helpers/crypto'), 'decrypt')
			.mockRejectedValue(new Error('Decryption failed'));

		await expect(decryptNsecWithPassword(mockEncryptParams))
			.rejects.toThrow('Failed to decrypt with password');
	});
});
