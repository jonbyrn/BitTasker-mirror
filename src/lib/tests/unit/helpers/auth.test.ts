import { describe, it, expect, vi } from 'vitest';
import {
	decryptNsecWithBiometrics,
	encryptMasterKeyData,
	decryptNsecFromMasterKey,
	decryptWalletFromMasterKey
} from '$lib/utils/helpers/auth';
import type { EncryptedData } from '$lib/types/auth';

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
			rawKey,
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
	const mockWalletMnemonic =
		'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
	const mockMasterPassword = 'test-master-password';

	it('should encrypt both nsec and mnemonic with master key system', async () => {
		// Create mock encrypted data
		const mockCryptoEncrypted = {
			data: 'mockEncryptedData',
			iv: 'mockIvData',
			authTag: 'mockAuthTagData'
		};

		// Create a real CryptoKey for mocking
		const rawKey = new Uint8Array(32).fill(1);
		const realKey = await crypto.subtle.importKey(
			'raw',
			rawKey,
			{ name: 'AES-GCM', length: 256 },
			true,
			['encrypt', 'decrypt']
		);

		// Mock the crypto functions
		const deriveKeyFromPasswordSpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'deriveKeyFromPassword')
			.mockResolvedValue(realKey);

		const deriveContextKeySpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'deriveContextKey')
			.mockResolvedValue(realKey);

		const encryptSpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'encrypt')
			.mockResolvedValue(mockCryptoEncrypted);

		const exportKeySpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'exportKey')
			.mockResolvedValue('mockExportedKey');

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

		// Clean up
		deriveKeyFromPasswordSpy.mockRestore();
		deriveContextKeySpy.mockRestore();
		encryptSpy.mockRestore();
		exportKeySpy.mockRestore();
	});

	it('should decrypt nsec from master key data', async () => {
		// Create mock encrypted data
		const mockCryptoEncrypted = {
			data: 'mockEncryptedData',
			iv: 'mockIvData',
			authTag: 'mockAuthTagData'
		};

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

		// Create a real CryptoKey for mocking
		const rawKey = new Uint8Array(32).fill(1);
		const realKey = await crypto.subtle.importKey(
			'raw',
			rawKey,
			{ name: 'AES-GCM', length: 256 },
			true,
			['encrypt', 'decrypt']
		);

		// Mock the crypto functions
		const importKeySpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'importKey')
			.mockResolvedValue(realKey);

		const deriveContextKeySpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'deriveContextKey')
			.mockResolvedValue(realKey);

		const decryptSpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'decrypt')
			.mockResolvedValue(mockNostrPrivateKey);

		const decryptedNsec = await decryptNsecFromMasterKey(mockEncryptedData, 'mockExportedKey');

		expect(decryptedNsec).toBe(mockNostrPrivateKey);
		expect(importKeySpy).toHaveBeenCalledWith('mockExportedKey');
		expect(decryptSpy).toHaveBeenCalled();

		// Clean up
		importKeySpy.mockRestore();
		deriveContextKeySpy.mockRestore();
		decryptSpy.mockRestore();
	});

	it('should decrypt wallet mnemonic from master key data', async () => {
		// Create mock encrypted data
		const mockCryptoEncrypted = {
			data: 'mockEncryptedData',
			iv: 'mockIvData',
			authTag: 'mockAuthTagData'
		};

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

		// Create a real CryptoKey for mocking
		const rawKey = new Uint8Array(32).fill(1);
		const realKey = await crypto.subtle.importKey(
			'raw',
			rawKey,
			{ name: 'AES-GCM', length: 256 },
			true,
			['encrypt', 'decrypt']
		);

		// Mock the crypto functions
		const importKeySpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'importKey')
			.mockResolvedValue(realKey);

		const deriveContextKeySpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'deriveContextKey')
			.mockResolvedValue(realKey);

		const decryptSpy = vi
			.spyOn(await import('$lib/utils/helpers/crypto'), 'decrypt')
			.mockResolvedValue(mockWalletMnemonic);

		const decryptedMnemonic = await decryptWalletFromMasterKey(
			mockEncryptedData,
			'mockExportedKey'
		);

		expect(decryptedMnemonic).toBe(mockWalletMnemonic);
		expect(importKeySpy).toHaveBeenCalledWith('mockExportedKey');
		expect(decryptSpy).toHaveBeenCalled();

		// Clean up
		importKeySpy.mockRestore();
		deriveContextKeySpy.mockRestore();
		decryptSpy.mockRestore();
	});
});
