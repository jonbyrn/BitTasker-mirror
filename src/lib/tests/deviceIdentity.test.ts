import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';
import { getDeviceIdentifier, getDeviceName } from '../utils/helpers/deviceIdentity';
import type { DeviceInfo } from '@capacitor/device';

// Mock the Capacitor plugins
vi.mock('@capacitor/device', () => ({
  Device: {
    getId: vi.fn(),
    getInfo: vi.fn()
  }
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn()
  }
}));

describe('Device Identity Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up default mock implementations
    (Device.getId as any).mockResolvedValue({ identifier: 'test-device-id' });
    (Device.getInfo as any).mockResolvedValue({
      platform: 'ios',
      model: 'iPhone',
      manufacturer: 'Apple',
      operatingSystem: 'ios',
      osVersion: '15.0',
      webViewVersion: '15.0',
      isVirtual: false,
      name: 'iPhone 13'
    } as DeviceInfo);
    
    (Preferences.get as any).mockResolvedValue({ value: null });
    (Preferences.set as any).mockResolvedValue(undefined);
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
        osVersion: '15.5',
        manufacturer: 'Apple',
        operatingSystem: 'ios',
        webViewVersion: '15.5',
        isVirtual: false,
        name: 'iPhone 13'
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
      vi.mocked(Device.getId).mockResolvedValue({ identifier: '' });
      vi.mocked(Device.getInfo).mockResolvedValue({
        platform: 'android',
        manufacturer: 'Samsung',
        model: 'Galaxy S21',
        osVersion: '12.0',
        operatingSystem: 'android',
        webViewVersion: '12.0',
        isVirtual: false,
        name: 'Galaxy S21'
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
      vi.mocked(Device.getId).mockResolvedValue({ identifier: '' });
      vi.mocked(Device.getInfo).mockResolvedValue({
        platform: 'web',
        operatingSystem: 'windows',
        manufacturer: 'Microsoft',
        model: 'Windows PC',
        osVersion: '10',
        webViewVersion: '91.0',
        isVirtual: false,
        name: 'Windows PC'
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
        model: 'iPhone 13 Pro',
        operatingSystem: 'ios',
        osVersion: '15.0',
        manufacturer: 'Apple',
        webViewVersion: '15.0',
        isVirtual: false,
        name: 'iPhone 13 Pro'
      });
      
      const name = await getDeviceName();
      
      expect(name).toBe('iPhone 13 Pro');
    });
    
    it('should return Android device name', async () => {
      vi.mocked(Device.getInfo).mockResolvedValue({
        platform: 'android',
        manufacturer: 'Samsung',
        model: 'Galaxy S21',
        operatingSystem: 'android',
        osVersion: '12.0',
        webViewVersion: '12.0',
        isVirtual: false,
        name: 'Galaxy S21'
      });
      
      const name = await getDeviceName();
      
      expect(name).toBe('Samsung Galaxy S21');
    });
    
    it('should return web browser name', async () => {
      vi.mocked(Device.getInfo).mockResolvedValue({
        platform: 'web',
        operatingSystem: 'windows',
        manufacturer: 'Microsoft',
        model: 'Windows PC',
        osVersion: '10',
        webViewVersion: '91.0',
        isVirtual: false,
        name: 'Windows PC'
      });
      
      // Mock navigator for browser detection
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        configurable: true
      });
      
      const name = await getDeviceName();
      
      expect(name).toBe('Chrome on windows');
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