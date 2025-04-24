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
    
    // Mock crypto.subtle methods
    Object.defineProperty(global, 'crypto', {
      value: {
        subtle: {
          generateKey: vi.fn(),
          exportKey: vi.fn(),
          importKey: vi.fn(),
          encrypt: vi.fn(),
          decrypt: vi.fn(),
          deriveKey: vi.fn(),
          digest: vi.fn()
        },
        getRandomValues: vi.fn((array) => array)
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
    });
  });
  
  describe('importKey', () => {
    it('should import key from base64 string', async () => {
      const mockKeyData = 'c29tZXJhbmRvbWtleWRhdGE='; // "somerandomkeydata" in base64
      
      const key = await importKey(mockKeyData);
      
      expect(crypto.subtle.importKey).toHaveBeenCalledWith(
        'raw',
        expect.any(Uint8Array),
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      expect(key).toEqual({ type: 'secret', algorithm: { name: 'AES-GCM' } });
    });
  });
  
  describe('encrypt', () => {
    it('should encrypt data and return encrypted data object', async () => {
      const mockData = 'test data';
      const mockKey = { type: 'secret' };
      const mockEncryptedData = new Uint8Array([1, 2, 3]);
      
      crypto.subtle.encrypt.mockResolvedValue(mockEncryptedData);
      
      const result = await encrypt(mockData, mockKey);
      
      expect(crypto.subtle.encrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'AES-GCM',
          tagLength: 128
        }),
        mockKey,
        expect.any(Uint8Array)
      );
      
      expect(result).toEqual({
        data: expect.any(String),
        iv: expect.any(String)
      });
    });
  });
  
  describe('decrypt', () => {
    it('should decrypt encrypted data and return original string', async () => {
      const mockKey = { type: 'secret' } as CryptoKey;
      const mockEncryptedData = {
        data: 'bW9ja2RhdGE=', // "mockdata" in base64
        iv: 'aXZpdml2', // "iviviv" in base64
        authTag: 'YXV0aHRhZw==' // "authtag" in base64
      };
      
      const result = await decrypt(mockEncryptedData, mockKey);
      
      expect(crypto.subtle.decrypt).toHaveBeenCalledWith(
        {
          name: 'AES-GCM',
          iv: expect.any(Uint8Array),
          tagLength: 128
        },
        mockKey,
        expect.any(Uint8Array)
      );
      expect(result).toBe('test data');
    });
  });
  
  describe('deriveKeyFromPassword', () => {
    it('should derive key from password using PBKDF2', async () => {
      const password = 'testpassword';
      const salt = new Uint8Array(16);
      const iterations = 100000;
      const mockDerivedKey = { type: 'secret' };
      
      crypto.subtle.importKey.mockResolvedValue({ type: 'raw' });
      crypto.subtle.deriveKey.mockResolvedValue(mockDerivedKey);
      
      const result = await deriveKeyFromPassword(password, salt, iterations);
      
      expect(crypto.subtle.importKey).toHaveBeenCalledWith(
        'raw',
        expect.any(Uint8Array),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      
      expect(result).toBe(mockDerivedKey);
    });
    
    it('should throw an error if key derivation fails', async () => {
      const password = 'testpassword';
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      
      vi.spyOn(crypto.subtle, 'importKey').mockRejectedValueOnce(new Error('Mock error'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await expect(deriveKeyFromPassword(password, salt)).rejects.toThrow('Failed to derive key from password');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
}); 