import { describe, it, expect, vi } from 'vitest';
import {
	decryptNsecWithBiometrics,
	signLoginChallenge,
	encryptMasterKeyData,
	decryptNsecFromMasterKey,
	decryptWalletFromMasterKey,
	isMasterKeyEncryptedData
} from '$lib/utils/helpers/auth';

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

	it('should decrypt private key with biometrics', async () => {
		// Mock implementation for decryptNsecWithBiometrics
		// This implementation bypasses the normal biometric checks
		const mockEncryptedDataString = JSON.stringify(mockEncryptionData);

		// Use vi.spyOn to mock the implementation of the imported function
		const decryptSpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'decrypt')
			.mockResolvedValue(mockNostrPrivateKey);

		const importKeySpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'importKey')
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

	it('should sign a login challenge with a private key', async () => {
		const challenge = {
			challenge: 'abcdef1234567890',
			message: 'Sign this message: abcdef1234567890'
		};

		const signature = await signLoginChallenge(challenge.challenge, mockNostrPrivateKey);

		expect(typeof signature).toBe('string');
		expect(signature.length).toBeGreaterThan(0);
	});
});

describe('Master Key System', () => {
	const mockNostrPrivateKey = '8e1ef72c2da4cf2993ed43fbc059f7a2a6b61de21d706d8fa48ca91b7ceef05f';
	const mockWalletMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
	const mockDeviceId = 'device_123456789';

	it('should encrypt both nsec and mnemonic with master key system', async () => {
		const result = await encryptMasterKeyData(mockNostrPrivateKey, mockWalletMnemonic, mockDeviceId);

		expect(result).toHaveProperty('nostr');
		expect(result).toHaveProperty('wallet');
		expect(result).toHaveProperty('masterSalt');
		expect(result).toHaveProperty('exportedMasterKey');
		
		expect(result.nostr).toHaveProperty('encrypted');
		expect(result.nostr).toHaveProperty('salt');
		expect(result.nostr).toHaveProperty('iterations');
		
		expect(result.wallet).toHaveProperty('encrypted');
		expect(result.wallet).toHaveProperty('salt');
		expect(result.wallet).toHaveProperty('iterations');
		
		expect(typeof result.masterSalt).toBe('string');
		expect(typeof result.exportedMasterKey).toBe('string');
	});

	it('should decrypt nsec from master key data', async () => {
		const masterKeyData = await encryptMasterKeyData(mockNostrPrivateKey, mockWalletMnemonic, mockDeviceId);
		
		const decryptedNsec = await decryptNsecFromMasterKey(masterKeyData, masterKeyData.exportedMasterKey);
		
		expect(decryptedNsec).toBe(mockNostrPrivateKey);
	});

	it('should decrypt wallet mnemonic from master key data', async () => {
		const masterKeyData = await encryptMasterKeyData(mockNostrPrivateKey, mockWalletMnemonic, mockDeviceId);
		
		const decryptedMnemonic = await decryptWalletFromMasterKey(masterKeyData, masterKeyData.exportedMasterKey);
		
		expect(decryptedMnemonic).toBe(mockWalletMnemonic);
	});

	it('should correctly identify master key encrypted data', () => {
		const masterKeyData = {
			nostr: {
				encrypted: { data: 'test', iv: 'test', authTag: 'test' },
				salt: 'test',
				iterations: 100000
			},
			wallet: {
				encrypted: { data: 'test', iv: 'test', authTag: 'test' },
				salt: 'test',
				iterations: 100000
			},
			masterSalt: 'test',
			exportedMasterKey: 'test'
		};

		expect(isMasterKeyEncryptedData(masterKeyData)).toBe(true);
		expect(isMasterKeyEncryptedData(JSON.stringify(masterKeyData))).toBe(true);
		expect(isMasterKeyEncryptedData({})).toBe(false);
		expect(isMasterKeyEncryptedData('invalid')).toBe(false);
	});
});
