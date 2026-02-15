import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';
import {
	getDeviceIdentifier,
	getDeviceName,
	formatPasskeyName,
	getNpubShortId,
	createUserDeviceShortName
} from '../utils/helpers/deviceIdentity';
import type { DeviceInfo } from '@capacitor/device';
import * as deviceIdentity from '../utils/helpers/deviceIdentity';

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
				value:
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
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

	describe('formatPasskeyName', () => {
		const validNpub = 'npub1abc123def456ghi789jkl012mno345pqr678stu901vwx234yz';
		const validHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

		beforeEach(() => {
			// Mock createUserDeviceShortName for fallback scenarios
			// Default: return a device name, but allow tests to override
			// Note: Tests that need it to throw should override this mock
			if (!vi.isMockFunction(deviceIdentity.createUserDeviceShortName)) {
				vi.spyOn(deviceIdentity, 'createUserDeviceShortName').mockImplementation(
					async (publicKey: string) => {
						const deviceName = await getDeviceName();
						return `${deviceName}-test`;
					}
				);
			}
		});

		describe('Priority: Username', () => {
			it('should use username when provided', async () => {
				const result = await formatPasskeyName(validNpub, 'JohnDoe');
				expect(result).toBe('JohnDoe@bittasker.com');
			});

			it('should preserve capital letters in username', async () => {
				const result = await formatPasskeyName(validNpub, 'JohnDoe');
				expect(result).toBe('JohnDoe@bittasker.com');
			});

			it('should trim whitespace from username', async () => {
				const result = await formatPasskeyName(validNpub, '  JohnDoe  ');
				expect(result).toBe('JohnDoe@bittasker.com');
			});

			it('should handle username with dots', async () => {
				const result = await formatPasskeyName(validNpub, 'John.Doe');
				expect(result).toBe('John.Doe@bittasker.com');
			});

			it('should handle username with dashes', async () => {
				const result = await formatPasskeyName(validNpub, 'John-Doe');
				expect(result).toBe('John-Doe@bittasker.com');
			});

			it('should handle username with underscores', async () => {
				const result = await formatPasskeyName(validNpub, 'John_Doe');
				expect(result).toBe('John_Doe@bittasker.com');
			});

			it('should handle username with spaces', async () => {
				const result = await formatPasskeyName(validNpub, 'John Doe');
				expect(result).toBe('John Doe@bittasker.com');
			});

			it('should handle username with special characters', async () => {
				const result = await formatPasskeyName(validNpub, 'John@Doe#123');
				expect(result).toBe('John@Doe#123@bittasker.com');
			});

			it('should ignore displayName when username is provided', async () => {
				const result = await formatPasskeyName(validNpub, 'JohnDoe', 'DisplayName');
				expect(result).toBe('JohnDoe@bittasker.com');
			});
		});

		describe('Priority: Display Name', () => {
			it('should use displayName when username is not provided', async () => {
				const result = await formatPasskeyName(validNpub, null, 'Jane Smith');
				expect(result).toBe('Jane Smith@bittasker.com');
			});

			it('should use displayName when username is empty', async () => {
				const result = await formatPasskeyName(validNpub, '', 'Jane Smith');
				expect(result).toBe('Jane Smith@bittasker.com');
			});

			it('should preserve capital letters in displayName', async () => {
				const result = await formatPasskeyName(validNpub, null, 'JaneSmith');
				expect(result).toBe('JaneSmith@bittasker.com');
			});

			it('should trim whitespace from displayName', async () => {
				const result = await formatPasskeyName(validNpub, null, '  Jane Smith  ');
				expect(result).toBe('Jane Smith@bittasker.com');
			});

			it('should handle displayName with special characters', async () => {
				const result = await formatPasskeyName(validNpub, null, 'Jane-Smith');
				expect(result).toBe('Jane-Smith@bittasker.com');
			});
		});

		describe('Priority: Npub Short ID', () => {
			it('should use first 6 chars of npub when username and displayName are not provided', async () => {
				const result = await formatPasskeyName(validNpub);
				// getNpubShortId returns first 6 chars after 'npub' prefix
				// For 'npub1abc123...' it returns '1abc12'
				expect(result).toBe('1abc12@bittasker.com');
			});

			it('should handle hex format npub by converting to npub first', async () => {
				const result = await formatPasskeyName(validHex);
				// Should convert hex to npub and extract first 6 chars
				expect(result).toMatch(/^[a-z0-9]{6}@bittasker\.com$/);
			});

			it('should handle short npub (less than 10 chars)', async () => {
				const shortNpub = 'npub1abc';
				const result = await formatPasskeyName(shortNpub);
				// Should use available chars
				expect(result).toMatch(/^[a-z0-9]+@bittasker\.com$/);
			});

			it('should handle empty result from getNpubShortId', async () => {
				// Mock getNpubShortId to return empty string
				vi.spyOn(deviceIdentity, 'getNpubShortId').mockReturnValue('');
				
				const result = await formatPasskeyName(validNpub);
				// Should fallback to slice or device name
				expect(result).toMatch(/^.+@bittasker\.com$/);
				
				// Restore
				vi.restoreAllMocks();
			});
		});

		describe('Fallback: Device Name', () => {
			it('should fallback to device name when all inputs fail', async () => {
				// Mock getNpubShortId to return empty
				vi.spyOn(deviceIdentity, 'getNpubShortId').mockReturnValue('');
				
				const result = await formatPasskeyName(validNpub, null, null);
				// Should use device name
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});

			it('should fallback to device name when namePart becomes empty after processing', async () => {
				// This shouldn't happen with current implementation, but test the fallback
				const result = await formatPasskeyName(validNpub, '', '');
				// Should use npub short ID or device name
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});
		});

		describe('Fallback: Unknown', () => {
			beforeEach(() => {
				// Clear any existing mocks for these tests
				vi.restoreAllMocks();
			});

			it('should return "Unknown@bittasker.com" when npub is empty and device name creation fails', async () => {
				// Set up mock to throw when called with 'fallback'
				vi.spyOn(deviceIdentity, 'createUserDeviceShortName').mockRejectedValue(
					new Error('Invalid npub')
				);
				
				const result = await formatPasskeyName('');
				expect(result).toBe('Unknown@bittasker.com');
			});

			it('should return "Unknown@bittasker.com" when npub is null and device name creation fails', async () => {
				// Set up mock to throw when called with 'fallback'
				vi.spyOn(deviceIdentity, 'createUserDeviceShortName').mockRejectedValue(
					new Error('Invalid npub')
				);
				
				// @ts-expect-error - testing edge case
				const result = await formatPasskeyName(null);
				expect(result).toBe('Unknown@bittasker.com');
			});

			it('should return "Unknown@bittasker.com" when device name creation fails', async () => {
				// Set up mock to throw when called with 'fallback'
				vi.spyOn(deviceIdentity, 'createUserDeviceShortName').mockRejectedValue(
					new Error('Device error')
				);
				
				const result = await formatPasskeyName('');
				expect(result).toBe('Unknown@bittasker.com');
			});
		});

		describe('Edge Cases', () => {
			it('should handle very short hex npub', async () => {
				const shortHex = 'abc';
				const result = await formatPasskeyName(shortHex);
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});

			it('should handle npub with only "npub" prefix', async () => {
				const minimalNpub = 'npub';
				const result = await formatPasskeyName(minimalNpub);
				// Should fallback to device name
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});

			it('should handle invalid hex that fails encoding', async () => {
				const invalidHex = 'not-a-valid-hex';
				const result = await formatPasskeyName(invalidHex);
				// Should fallback to using the hex as-is or device name
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});

			it('should handle username with only whitespace', async () => {
				const result = await formatPasskeyName(validNpub, '   ');
				// Should use npub short ID (first 6 chars after 'npub')
				expect(result).toBe('1abc12@bittasker.com');
			});

			it('should handle displayName with only whitespace', async () => {
				const result = await formatPasskeyName(validNpub, null, '   ');
				// Should use npub short ID (first 6 chars after 'npub')
				expect(result).toBe('1abc12@bittasker.com');
			});

			it('should handle very long username', async () => {
				const longUsername = 'A'.repeat(200);
				const result = await formatPasskeyName(validNpub, longUsername);
				// Should keep the long username as-is
				expect(result).toBe(`${longUsername}@bittasker.com`);
			});

			it('should handle unicode characters in username', async () => {
				const result = await formatPasskeyName(validNpub, 'José');
				expect(result).toBe('José@bittasker.com');
			});

			it('should handle unicode characters in displayName', async () => {
				const result = await formatPasskeyName(validNpub, null, 'José María');
				expect(result).toBe('José María@bittasker.com');
			});
		});

		describe('Format Validation', () => {
			it('should always return format ending with @bittasker.com', async () => {
				const testCases = [
					['JohnDoe', null],
					[null, 'Jane Smith'],
					[null, null],
					['', ''],
					['   ', '   ']
				];

				for (const [username, displayName] of testCases) {
					const result = await formatPasskeyName(validNpub, username, displayName);
					expect(result).toMatch(/@bittasker\.com$/);
				}
			});

			it('should always return a non-empty result', async () => {
				const testCases = [
					['', ''],
					[null, null],
					['   ', '   '],
					['', null],
					[null, '']
				];

				for (const [username, displayName] of testCases) {
					const result = await formatPasskeyName(validNpub, username, displayName);
					expect(result.length).toBeGreaterThan('@bittasker.com'.length);
				}
			});
		});

		describe('Integration with getNpubShortId', () => {
			it('should use getNpubShortId result when available', async () => {
				const npub = 'npub1test123456789';
				const shortId = getNpubShortId(npub);
				expect(shortId).toBe('1test1'); // First 6 chars after 'npub'
				const result = await formatPasskeyName(npub);
				expect(result).toBe(`${shortId}@bittasker.com`);
			});

			it('should handle when getNpubShortId returns empty for npub format', async () => {
				// Create a scenario where getNpubShortId might return empty
				// This is unlikely but test the fallback
				const npub = 'npub'; // Minimal npub
				const result = await formatPasskeyName(npub);
				// Should fallback appropriately
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});
		});
	});
});
