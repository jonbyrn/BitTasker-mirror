import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { EncryptionData } from '$lib/types/auth';
import { NativeBiometric, BiometryType } from 'capacitor-native-biometric';
import { Preferences } from '@capacitor/preferences';
import {
  checkBiometricAvailability,
  verifyIdentity,
  setBiometricKey,
  getBiometricData,
} from '../utils/helpers/biometrics';
import {
  checkWebBiometricAvailability,
  verifyIdentity as webVerifyIdentity,
} from '../utils/helpers/webBiometrics';

// Mock capacitor-native-biometric
vi.mock('capacitor-native-biometric', () => ({
  NativeBiometric: {
    isAvailable: vi.fn(),
    verifyIdentity: vi.fn(),
    setCredentials: vi.fn(),
    getCredentials: vi.fn(),
  },
}));

// Mock @capacitor/preferences
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('Biometrics Utilities', () => {
  const mockEncryptionData: EncryptionData = {
    key: 'test-key',
    iv: 'test-iv',
    authTag: 'test-auth-tag',
    data: 'test-data',
    salt: 'test-salt'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup global for web tests
    global.window = {
      PublicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn(),
      },
      navigator: {
        credentials: {
          get: vi.fn(),
        },
      },
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Native Biometrics', () => {
    it('should return false when not on native platform', async () => {
      const mockedNativeBiometric = vi.mocked(NativeBiometric);
      mockedNativeBiometric.isAvailable.mockResolvedValue({ 
        isAvailable: false,
        biometryType: BiometryType.NONE
      });
      const result = await checkBiometricAvailability();
      expect(result).toBe(false);
    });

    it('should return biometric availability on native platform', async () => {
      const mockedNativeBiometric = vi.mocked(NativeBiometric);
      mockedNativeBiometric.isAvailable.mockResolvedValue({ 
        isAvailable: true,
        biometryType: BiometryType.TOUCH_ID
      });
      const result = await checkBiometricAvailability();
      expect(result).toBe(true);
    });

    it('should return true when verification succeeds', async () => {
      const mockedNativeBiometric = vi.mocked(NativeBiometric);
      mockedNativeBiometric.verifyIdentity.mockResolvedValue(undefined);
      const result = await verifyIdentity();
      expect(result).toBe(true);
    });

    it('should return false when verification fails', async () => {
      const mockedNativeBiometric = vi.mocked(NativeBiometric);
      mockedNativeBiometric.verifyIdentity.mockRejectedValue(new Error('Failed'));
      const result = await verifyIdentity();
      expect(result).toBe(false);
    });

    it('should store credentials and return true on success', async () => {
      const mockedNativeBiometric = vi.mocked(NativeBiometric);
      mockedNativeBiometric.setCredentials.mockResolvedValue(undefined);
      const result = await setBiometricKey('test-key', mockEncryptionData);
      expect(result).toBe(true);
    });

    it('should return false on failure', async () => {
      const mockedNativeBiometric = vi.mocked(NativeBiometric);
      mockedNativeBiometric.setCredentials.mockRejectedValue(new Error('Failed'));
      const result = await setBiometricKey('test-key', mockEncryptionData);
      expect(result).toBe(false);
    });

    it('should return credentials after successful verification', async () => {
      const mockedNativeBiometric = vi.mocked(NativeBiometric);
      mockedNativeBiometric.verifyIdentity.mockResolvedValue(undefined);
      mockedNativeBiometric.getCredentials.mockResolvedValue({ 
        username: 'test-user',
        password: JSON.stringify(mockEncryptionData)
      });
      const result = await getBiometricData();
      expect(result).toEqual(mockEncryptionData);
    });

    it('should return null when verification fails', async () => {
      const mockedNativeBiometric = vi.mocked(NativeBiometric);
      mockedNativeBiometric.verifyIdentity.mockRejectedValue(new Error('Failed'));
      const result = await getBiometricData();
      expect(result).toBeNull();
    });

    it('should return null when retrieving credentials fails', async () => {
      const mockedNativeBiometric = vi.mocked(NativeBiometric);
      mockedNativeBiometric.verifyIdentity.mockResolvedValue(undefined);
      mockedNativeBiometric.getCredentials.mockRejectedValue(new Error('Failed'));
      const result = await getBiometricData();
      expect(result).toBeNull();
    });
  });

  describe('Web Biometrics', () => {
    const mockCredential = {
      id: 'test-id',
      type: 'public-key',
      response: {},
    };

    it('should return false when PublicKeyCredential is not available', async () => {
      global.window.PublicKeyCredential = undefined as any;
      const result = await checkWebBiometricAvailability();
      expect(result).toBe(false);
    });

    it('should return platform authenticator availability when WebAuthn is supported', async () => {
      (global.window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable as any).mockResolvedValue(true);
      const result = await checkWebBiometricAvailability();
      expect(result).toBe(true);
    });

    it('should return false on errors', async () => {
      (global.window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable as any).mockRejectedValue(new Error('Not available'));
      const result = await checkWebBiometricAvailability();
      expect(result).toBe(false);
    });

    it('should return false when no credential ID is found', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: null });
      const result = await webVerifyIdentity();
      expect(result).toBe(false);
    });

    it('should return true on successful verification', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: 'stored-credential-id' });
      (global.window.navigator.credentials.get as any).mockResolvedValue(mockCredential);
      const result = await webVerifyIdentity();
      expect(result).toBe(true);
    });

    it('should return false when get credential fails', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: 'stored-credential-id' });
      (global.window.navigator.credentials.get as any).mockRejectedValue(new Error('Auth failed'));
      const result = await webVerifyIdentity();
      expect(result).toBe(false);
    });
  });
}); 