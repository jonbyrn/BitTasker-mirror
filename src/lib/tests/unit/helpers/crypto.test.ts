import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	generateRandomKey,
	exportKey,
	importKey,
	encrypt,
	decrypt,
	deriveKeyFromPassword
} from '$lib/utils/helpers/crypto';

describe('Crypto Utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Mock crypto.subtle methods with proper return values
		Object.defineProperty(global, 'crypto', {
			value: {
				subtle: {
					generateKey: vi
						.fn()
						.mockResolvedValue({ type: 'secret', algorithm: { name: 'AES-GCM' } }),
					exportKey: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
					importKey: vi.fn().mockResolvedValue({ type: 'secret', algorithm: { name: 'AES-GCM' } }),
					encrypt: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
					decrypt: vi.fn().mockResolvedValue(new TextEncoder().encode('test data')),
					deriveKey: vi.fn().mockResolvedValue({ type: 'secret', algorithm: { name: 'AES-GCM' } }),
					digest: vi.fn()
				},
				getRandomValues: vi.fn((array) => array.fill(0))
			},
			configurable: true
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('generateRandomKey', () => {
		it('should generate a random AES-GCM key', async () => {
			const key = await generateRandomKey();

			expect(crypto.subtle.generateKey).toHaveBeenCalledWith(
				{ name: 'AES-GCM', length: 256 },
				true,
				['encrypt', 'decrypt']
			);
			expect(key).toEqual({ type: 'secret', algorithm: { name: 'AES-GCM' } });
		});
	});

	describe('exportKey', () => {
		it('should export key to base64 string', async () => {
			const mockKey = { type: 'secret' } as CryptoKey;

			const result = await exportKey(mockKey);

			expect(crypto.subtle.exportKey).toHaveBeenCalledWith('raw', mockKey);
			expect(typeof result).toBe('string');
			expect(result).toBe('AQID'); // base64 of [1,2,3]
		});
	});

	describe('importKey', () => {
		it('should import key from base64 string', async () => {
			const mockKeyData = 'AQID'; // base64 of [1,2,3]

			const key = await importKey(mockKeyData);

			// Implementation passes ArrayBuffer (new Uint8Array(keyBytes).buffer), not Uint8Array
			const importCall = vi.mocked(crypto.subtle.importKey).mock.calls[0];
			expect(importCall[0]).toBe('raw');
			expect(importCall[1]).toBeInstanceOf(Uint8Array);
			expect(new Uint8Array(importCall[1] as unknown as ArrayBuffer)).toEqual(
				new Uint8Array([1, 2, 3])
			);
			expect(importCall[2]).toEqual({ name: 'AES-GCM', length: 256 });
			expect(importCall[3]).toBe(true);
			expect(importCall[4]).toEqual(['encrypt', 'decrypt']);
			expect(key).toEqual({ type: 'secret', algorithm: { name: 'AES-GCM' } });
		});
	});

	describe('encrypt', () => {
		it('should encrypt data and return encrypted data object', async () => {
			const mockData = 'test data';
			const mockKey = { type: 'secret' } as CryptoKey;

			const result = await encrypt(mockData, mockKey);

			const encryptCall = vi.mocked(crypto.subtle.encrypt).mock.calls[0];
			expect(encryptCall[0]).toMatchObject({
				name: 'AES-GCM',
				tagLength: 128
			});
			expect(encryptCall[1]).toBe(mockKey);
			expect(ArrayBuffer.isView(encryptCall[2])).toBe(true);

			expect(result).toEqual({
				data: expect.any(String),
				iv: expect.any(String),
				authTag: expect.any(String)
			});
		});
	});

	describe('decrypt', () => {
		it('should decrypt encrypted data and return original string', async () => {
			const mockKey = { type: 'secret' } as CryptoKey;
			const mockEncryptedData = {
				data: 'AQID', // base64 of [1,2,3]
				iv: 'AQID', // base64 of [1,2,3]
				authTag: 'AQID' // base64 of [1,2,3]
			};

			const result = await decrypt(mockEncryptedData, mockKey);

			const decryptCall = vi.mocked(crypto.subtle.decrypt).mock.calls[0];
			expect(decryptCall[0]).toMatchObject({
				name: 'AES-GCM',
				tagLength: 128
			});
			expect(decryptCall[1]).toBe(mockKey);
			expect(ArrayBuffer.isView(decryptCall[2])).toBe(true);

			expect(result).toBe('test data');
		});
	});

	describe('deriveKeyFromPassword', () => {
		it('should derive key from password using PBKDF2', async () => {
			const password = 'testpassword';
			const salt = new Uint8Array(16);
			const iterations = 100000;

			const result = await deriveKeyFromPassword(password, salt, iterations);

			const importCall = vi.mocked(crypto.subtle.importKey).mock.calls[0];
			expect(importCall[0]).toBe('raw');
			expect(ArrayBuffer.isView(importCall[1])).toBe(true);
			expect(importCall[2]).toBe('PBKDF2');
			expect(importCall[3]).toBe(false);
			expect(importCall[4]).toEqual(['deriveKey']);

			const deriveCall = vi.mocked(crypto.subtle.deriveKey).mock.calls[0];
			expect(deriveCall[0]).toMatchObject({
				name: 'PBKDF2',
				hash: 'SHA-256'
			});
			expect(deriveCall[1]).toEqual(expect.any(Object));
			expect(deriveCall[2]).toEqual({ name: 'AES-GCM', length: 256 });
			expect(deriveCall[3]).toBe(true);
			expect(deriveCall[4]).toEqual(['encrypt', 'decrypt']);

			expect(result).toEqual({ type: 'secret', algorithm: { name: 'AES-GCM' } });
		});

		it('should throw an error if key derivation fails', async () => {
			const password = 'testpassword';
			const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

			vi.spyOn(crypto.subtle, 'importKey').mockRejectedValueOnce(new Error('Mock error'));

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			await expect(deriveKeyFromPassword(password, salt)).rejects.toThrow(
				'Failed to derive key from password'
			);

			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});
});
