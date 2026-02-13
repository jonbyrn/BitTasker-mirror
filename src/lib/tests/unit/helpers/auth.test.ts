import { describe, it, expect, vi } from 'vitest';
import {
	decryptNsecWithBiometrics,
	encryptMasterKeyData,
	decryptNsecFromMasterKey,
	decryptWalletFromMasterKey
} from '$lib/utils/helpers/auth';
import type { EncryptedData } from '$lib/types/auth';

vi.mock('capacitor-native-biometric', () => ({
	NativeBiometric: {
		setCredentials: vi.fn(),
		getCredentials: vi.fn()
	}
}));

describe('Nostr Key Encryption', () => {
	const mockNostrPrivateKey = '8e1ef72c2da4cf2993ed43fbc059f7a2a6b61de21d706d8fa48ca91b7ceef05f';
	const mockCryptoEncrypted = {
		data: 'mockEncryptedData',
		iv: 'mockIvData',
		authTag: 'mockAuthTagData'
	};

	it('should decrypt private key with biometrics', async () => {
		const mockEncryptedData: EncryptedData = {
			nostr: {
				encrypted: mockCryptoEncrypted,
				salt: 'bW9ja1NhbHREYXRh',
				iterations: 100000
			},
			wallet: {
				encrypted: mockCryptoEncrypted,
				salt: 'bW9ja1NhbHREYXRh',
				iterations: 100000
			},
			masterSalt: 'bW9ja01hc3RlclNhbHQ='
		};
		const mockExportedKey = 'mockExportedKey';

		// Use a real CryptoKey so deriveContextKey's exportKey call succeeds
		const rawKey = new Uint8Array(32).fill(1);
		const realKey = await crypto.subtle.importKey(
			'raw',
			rawKey.buffer,
			{ name: 'AES-GCM', length: 256 },
			true,
			['encrypt', 'decrypt']
		);

		const decryptSpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'decrypt')
			.mockResolvedValue(mockNostrPrivateKey);

		const importKeySpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'importKey')
			.mockResolvedValue(realKey);

		const decryptedKey = await decryptNsecWithBiometrics(mockEncryptedData, mockExportedKey);

		expect(decryptedKey).toBe(mockNostrPrivateKey);
		expect(importKeySpy).toHaveBeenCalledWith(mockExportedKey);
		expect(decryptSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				data: mockCryptoEncrypted.data,
				iv: mockCryptoEncrypted.iv,
				authTag: mockCryptoEncrypted.authTag
			}),
			expect.anything()
		);

		decryptSpy.mockRestore();
		importKeySpy.mockRestore();
	});
});

describe('Master Key System', () => {
	const mockNostrPrivateKey = '8e1ef72c2da4cf2993ed43fbc059f7a2a6b61de21d706d8fa48ca91b7ceef05f';
	const mockWalletMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
	const mockMasterPassword = 'test-master-password';

	it('should encrypt both nsec and mnemonic with master key system', async () => {
		const result = await encryptMasterKeyData(
			mockNostrPrivateKey,
			mockWalletMnemonic,
			mockMasterPassword
		);

		expect(result).toHaveProperty('encryptedData');
		expect(result).toHaveProperty('exportedKey');
		expect(result.encryptedData).toHaveProperty('nostr');
		expect(result.encryptedData).toHaveProperty('wallet');
		expect(result.encryptedData).toHaveProperty('masterSalt');

		expect(result.encryptedData.nostr).toHaveProperty('encrypted');
		expect(result.encryptedData.nostr).toHaveProperty('salt');
		expect(result.encryptedData.nostr).toHaveProperty('iterations');

		expect(result.encryptedData.wallet).toHaveProperty('encrypted');
		expect(result.encryptedData.wallet).toHaveProperty('salt');
		expect(result.encryptedData.wallet).toHaveProperty('iterations');

		expect(typeof result.encryptedData.masterSalt).toBe('string');
		expect(typeof result.exportedKey).toBe('string');
	});

	it('should decrypt nsec from master key data', async () => {
		const { encryptedData, exportedKey } = await encryptMasterKeyData(
			mockNostrPrivateKey,
			mockWalletMnemonic,
			mockMasterPassword
		);

		const decryptedNsec = await decryptNsecFromMasterKey(encryptedData, exportedKey);

		expect(decryptedNsec).toBe(mockNostrPrivateKey);
	});

	it('should decrypt wallet mnemonic from master key data', async () => {
		const { encryptedData, exportedKey } = await encryptMasterKeyData(
			mockNostrPrivateKey,
			mockWalletMnemonic,
			mockMasterPassword
		);

		const decryptedMnemonic = await decryptWalletFromMasterKey(encryptedData, exportedKey);

		expect(decryptedMnemonic).toBe(mockWalletMnemonic);
	});
});
