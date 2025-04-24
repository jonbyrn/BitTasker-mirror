import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDeviceIdentifier, getDeviceName } from '$lib/utils/helpers/deviceIdentity';

// Mock Capacitor modules
vi.mock('@capacitor/device', () => ({
  Device: {
    getInfo: vi.fn(),
    getId: vi.fn()
  }
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn()
  }
}));

// Mock StorageKeys from constants
vi.mock('$lib/utils/constants/storage', () => ({
  StorageKeys: {
    DEVICE_UNIQUE_ID: 'device_unique_id'
  }
}));

describe('Device Identity Utilities', () => {
  const Device = require('@capacitor/device').Device;
  const Preferences = require('@capacitor/preferences').Preferences;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock crypto.subtle.digest for browser fingerprinting
    Object.defineProperty(global, 'crypto', {
      value: {
        subtle: {
          digest: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]))
        },
        getRandomValues: vi.fn((array) => array)
      },
      configurable: true
    });

    // Mock device info
    vi.mocked(Device.getId).mockResolvedValue({ identifier: 'test-device-id' });
    vi.mocked(Device.getInfo).mockResolvedValue({
      platform: 'ios',
      model: 'iPhone',
      manufacturer: 'Apple',
      operatingSystem: 'iOS'
    });
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('getDeviceIdentifier', () => {
    it('should return stored device ID if available', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: 'stored-device-id' });
      
      const deviceId = await getDeviceIdentifier();
      
      expect(deviceId).toBe('stored-device-id');
      expect(Device.getInfo).not.toHaveBeenCalled();
      expect(Device.getId).not.toHaveBeenCalled();
    });
    
    it('should use device identifier when available', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: null });
      vi.mocked(Device.getId).mockResolvedValue({ identifier: 'hardware-id-123' });
      
      const deviceId = await getDeviceIdentifier();
      
      expect(deviceId).toBe('hardware-id-123');
      expect(Preferences.set).toHaveBeenCalledWith({
        key: 'device_unique_id',
        value: 'hardware-id-123'
      });
    });
    
    it('should create iOS device ID when identifier is not available', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: null });
      vi.mocked(Device.getId).mockResolvedValue({ identifier: 'unknown' });
      vi.mocked(Device.getInfo).mockResolvedValue({
        platform: 'ios',
        model: 'iPhone 13',
        osVersion: '15.5'
      });
      
      const deviceId = await getDeviceIdentifier();
      
      expect(deviceId).toBe('ios_iPhone 13_15.5');
      expect(Preferences.set).toHaveBeenCalledWith({
        key: 'device_unique_id',
        value: 'ios_iPhone 13_15.5'
      });
    });
    
    it('should create Android device ID when identifier is not available', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: null });
      vi.mocked(Device.getId).mockResolvedValue({ identifier: null });
      vi.mocked(Device.getInfo).mockResolvedValue({
        platform: 'android',
        manufacturer: 'Samsung',
        model: 'Galaxy S21',
        osVersion: '12.0'
      });
      
      const deviceId = await getDeviceIdentifier();
      
      expect(deviceId).toBe('android_Samsung_Galaxy S21_12.0');
      expect(Preferences.set).toHaveBeenCalledWith({
        key: 'device_unique_id',
        value: 'android_Samsung_Galaxy S21_12.0'
      });
    });
    
    it('should create browser fingerprint for web platform', async () => {
      // Setup for web platform
      vi.mocked(Preferences.get).mockResolvedValue({ value: null });
      vi.mocked(Device.getId).mockResolvedValue({ identifier: null });
      vi.mocked(Device.getInfo).mockResolvedValue({
        platform: 'web',
        operatingSystem: 'Windows'
      });
      
      // Mock window properties for browser fingerprint
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 Test Browser',
          platform: 'Win32',
          language: 'en-US',
          languages: ['en-US', 'en']
        },
        configurable: true
      });
      
      Object.defineProperty(global, 'window', {
        value: {
          screen: {
            width: 1920,
            height: 1080,
            colorDepth: 24
          }
        },
        configurable: true
      });
      
      Object.defineProperty(global, 'Intl', {
        value: {
          DateTimeFormat: () => ({
            resolvedOptions: () => ({ timeZone: 'America/New_York' })
          })
        },
        configurable: true
      });
      
      const deviceId = await getDeviceIdentifier();
      
      expect(deviceId).toMatch(/^web_/);
      expect(Preferences.set).toHaveBeenCalled();
    });
    
    it('should use fallback ID generation on error', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: null });
      vi.mocked(Device.getInfo).mockRejectedValue(new Error('Device info error'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const deviceId = await getDeviceIdentifier();
      
      expect(deviceId).toMatch(/^[0-9a-f]+$/); // Should be a hex string
      expect(consoleSpy).toHaveBeenCalled();
      expect(Preferences.set).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
  
  describe('getDeviceName', () => {
    it('should return iOS device name', async () => {
      vi.mocked(Device.getInfo).mockResolvedValue({
        platform: 'ios',
        model: 'iPhone 13 Pro'
      });
      
      const name = await getDeviceName();
      
      expect(name).toBe('iPhone 13 Pro');
    });
    
    it('should return Android device name', async () => {
      vi.mocked(Device.getInfo).mockResolvedValue({
        platform: 'android',
        manufacturer: 'Samsung',
        model: 'Galaxy S21'
      });
      
      const name = await getDeviceName();
      
      expect(name).toBe('Samsung Galaxy S21');
    });
    
    it('should return web browser name', async () => {
      vi.mocked(Device.getInfo).mockResolvedValue({
        platform: 'web',
        operatingSystem: 'Windows'
      });
      
      // Mock navigator for browser detection
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        configurable: true
      });
      
      const name = await getDeviceName();
      
      expect(name).toBe('Chrome on Windows');
    });
    
    it('should handle errors and return Unknown Device', async () => {
      vi.mocked(Device.getInfo).mockRejectedValue(new Error('Device info error'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const name = await getDeviceName();
      
      expect(name).toBe('Unknown Device');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
}); 