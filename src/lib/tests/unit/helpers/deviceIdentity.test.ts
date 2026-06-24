import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';
import {
	getDeviceIdentifier,
	getDeviceName,
	formatPasskeyName,
	getNpubShortId
} from '$lib/utils/helpers/deviceIdentity';
import type { DeviceInfo } from '@capacitor/device';
import * as deviceIdentity from '$lib/utils/helpers/deviceIdentity';

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
		vi.mocked(Device.getId).mockResolvedValue({ identifier: 'test-device-id' });
		vi.mocked(Device.getInfo).mockResolvedValue({
			platform: 'ios',
			model: 'iPhone',
			manufacturer: 'Apple',
			operatingSystem: 'ios',
			osVersion: '15.0',
			webViewVersion: '15.0',
			isVirtual: false,
			name: 'iPhone 13'
		} as DeviceInfo);

		vi.mocked(Preferences.get).mockResolvedValue({ value: null });
		vi.mocked(Preferences.set).mockResolvedValue(undefined);
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
			if (!vi.isMockFunction(deviceIdentity.createUserDeviceShortName)) {
				vi.spyOn(deviceIdentity, 'createUserDeviceShortName').mockImplementation(
					async (_publicKey: string) => {
						const deviceName = await getDeviceName();
						return `${deviceName}-test`;
					}
				);
			}
		});

		describe('Priority: Username', () => {
			it('should use username when provided', async () => {
				const result = await formatPasskeyName({ npub: validNpub, username: 'JohnDoe' });
				expect(result).toBe('JohnDoe@bittasker.com');
			});

			it('should preserve capital letters in username', async () => {
				const result = await formatPasskeyName({ npub: validNpub, username: 'JohnDoe' });
				expect(result).toBe('JohnDoe@bittasker.com');
			});

			it('should trim whitespace from username', async () => {
				const result = await formatPasskeyName({ npub: validNpub, username: '  JohnDoe  ' });
				expect(result).toBe('JohnDoe@bittasker.com');
			});

			it('should handle username with dots', async () => {
				const result = await formatPasskeyName({ npub: validNpub, username: 'John.Doe' });
				expect(result).toBe('John.Doe@bittasker.com');
			});

			it('should handle username with dashes', async () => {
				const result = await formatPasskeyName({ npub: validNpub, username: 'John-Doe' });
				expect(result).toBe('John-Doe@bittasker.com');
			});

			it('should handle username with underscores', async () => {
				const result = await formatPasskeyName({ npub: validNpub, username: 'John_Doe' });
				expect(result).toBe('John_Doe@bittasker.com');
			});

			it('should handle username with spaces', async () => {
				const result = await formatPasskeyName({ npub: validNpub, username: 'John Doe' });
				expect(result).toBe('John Doe@bittasker.com');
			});

			it('should handle username with special characters', async () => {
				const result = await formatPasskeyName({ npub: validNpub, username: 'John@Doe#123' });
				expect(result).toBe('John@Doe#123@bittasker.com');
			});

			it('should ignore displayName when username is provided', async () => {
				const result = await formatPasskeyName({
					npub: validNpub,
					username: 'JohnDoe',
					displayName: 'DisplayName'
				});
				expect(result).toBe('JohnDoe@bittasker.com');
			});
		});

		describe('Priority: Display Name', () => {
			it('should use displayName when username is not provided', async () => {
				const result = await formatPasskeyName({ npub: validNpub, displayName: 'Jane Smith' });
				expect(result).toBe('Jane Smith@bittasker.com');
			});

			it('should use displayName when username is empty', async () => {
				const result = await formatPasskeyName({
					npub: validNpub,
					username: '',
					displayName: 'Jane Smith'
				});
				expect(result).toBe('Jane Smith@bittasker.com');
			});

			it('should preserve capital letters in displayName', async () => {
				const result = await formatPasskeyName({ npub: validNpub, displayName: 'JaneSmith' });
				expect(result).toBe('JaneSmith@bittasker.com');
			});

			it('should trim whitespace from displayName', async () => {
				const result = await formatPasskeyName({
					npub: validNpub,
					displayName: '  Jane Smith  '
				});
				expect(result).toBe('Jane Smith@bittasker.com');
			});

			it('should handle displayName with special characters', async () => {
				const result = await formatPasskeyName({ npub: validNpub, displayName: 'Jane-Smith' });
				expect(result).toBe('Jane-Smith@bittasker.com');
			});
		});

		describe('Priority: Npub Short ID', () => {
			it('should use first 6 chars of npub when username and displayName are not provided', async () => {
				const result = await formatPasskeyName({ npub: validNpub });
				expect(result).toBe('1abc12@bittasker.com');
			});

			it('should handle hex format npub by converting to npub first', async () => {
				const result = await formatPasskeyName({ npub: validHex });
				expect(result).toMatch(/^[a-z0-9]{6}@bittasker\.com$/);
			});

			it('should handle short npub (less than 10 chars)', async () => {
				const shortNpub = 'npub1abc';
				const result = await formatPasskeyName({ npub: shortNpub });
				expect(result).toMatch(/^[a-z0-9]+@bittasker\.com$/);
			});

			it('should handle empty result from getNpubShortId', async () => {
				vi.spyOn(deviceIdentity, 'getNpubShortId').mockReturnValue('');
				const result = await formatPasskeyName({ npub: validNpub });
				expect(result).toMatch(/^.+@bittasker\.com$/);
				vi.restoreAllMocks();
			});
		});

		describe('Fallback: Device Name', () => {
			it('should fallback to device name when all inputs fail', async () => {
				vi.spyOn(deviceIdentity, 'getNpubShortId').mockReturnValue('');
				const result = await formatPasskeyName({ npub: validNpub });
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});

			it('should fallback to device name when namePart becomes empty after processing', async () => {
				const result = await formatPasskeyName({ npub: validNpub, username: '', displayName: '' });
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});
		});

		describe('Fallback: Unknown', () => {
			beforeEach(() => {
				vi.restoreAllMocks();
			});

			it('should return "Unknown@bittasker.com" when npub is empty and device name creation fails', async () => {
				vi.spyOn(deviceIdentity, 'createUserDeviceShortName').mockRejectedValue(
					new Error('Invalid npub')
				);
				const result = await formatPasskeyName({ npub: '' });
				expect(result).toBe('Unknown@bittasker.com');
			});

			it('should return "Unknown@bittasker.com" when npub is null and device name creation fails', async () => {
				vi.spyOn(deviceIdentity, 'createUserDeviceShortName').mockRejectedValue(
					new Error('Invalid npub')
				);
				const result = await formatPasskeyName({ npub: null as unknown as string });
				expect(result).toBe('Unknown@bittasker.com');
			});

			it('should return "Unknown@bittasker.com" when device name creation fails', async () => {
				vi.spyOn(deviceIdentity, 'createUserDeviceShortName').mockRejectedValue(
					new Error('Device error')
				);
				const result = await formatPasskeyName({ npub: '' });
				expect(result).toBe('Unknown@bittasker.com');
			});
		});

		describe('Edge Cases', () => {
			it('should handle very short hex npub', async () => {
				const result = await formatPasskeyName({ npub: 'abc' });
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});

			it('should handle npub with only "npub" prefix', async () => {
				const result = await formatPasskeyName({ npub: 'npub' });
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});

			it('should handle invalid hex that fails encoding', async () => {
				const result = await formatPasskeyName({ npub: 'not-a-valid-hex' });
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});

			it('should handle username with only whitespace', async () => {
				const result = await formatPasskeyName({ npub: validNpub, username: '   ' });
				expect(result).toBe('1abc12@bittasker.com');
			});

			it('should handle displayName with only whitespace', async () => {
				const result = await formatPasskeyName({ npub: validNpub, displayName: '   ' });
				expect(result).toBe('1abc12@bittasker.com');
			});

			it('should handle very long username', async () => {
				const longUsername = 'A'.repeat(200);
				const result = await formatPasskeyName({ npub: validNpub, username: longUsername });
				expect(result).toBe(`${longUsername}@bittasker.com`);
			});

			it('should handle unicode characters in username', async () => {
				const result = await formatPasskeyName({ npub: validNpub, username: 'José' });
				expect(result).toBe('José@bittasker.com');
			});

			it('should handle unicode characters in displayName', async () => {
				const result = await formatPasskeyName({ npub: validNpub, displayName: 'José María' });
				expect(result).toBe('José María@bittasker.com');
			});
		});

		describe('Format Validation', () => {
			it('should always return format ending with @bittasker.com', async () => {
				const testCases: Array<{ username?: string | null; displayName?: string | null }> = [
					{ username: 'JohnDoe' },
					{ displayName: 'Jane Smith' },
					{},
					{ username: '', displayName: '' },
					{ username: '   ', displayName: '   ' }
				];
				for (const opts of testCases) {
					const result = await formatPasskeyName({ npub: validNpub, ...opts });
					expect(result).toMatch(/@bittasker\.com$/);
				}
			});

			it('should always return a non-empty result', async () => {
				const testCases: Array<{ username?: string | null; displayName?: string | null }> = [
					{ username: '', displayName: '' },
					{},
					{ username: '   ', displayName: '   ' },
					{ username: '', displayName: null },
					{ username: null, displayName: '' }
				];
				for (const opts of testCases) {
					const result = await formatPasskeyName({ npub: validNpub, ...opts });
					expect(result.length).toBeGreaterThan('@bittasker.com'.length);
				}
			});
		});

		describe('Integration with getNpubShortId', () => {
			it('should use getNpubShortId result when available', async () => {
				const npub = 'npub1test123456789';
				const shortId = getNpubShortId(npub);
				expect(shortId).toBe('1test1');
				const result = await formatPasskeyName({ npub });
				expect(result).toBe(`${shortId}@bittasker.com`);
			});

			it('should handle when getNpubShortId returns empty for npub format', async () => {
				const result = await formatPasskeyName({ npub: 'npub' });
				expect(result).toMatch(/^.+@bittasker\.com$/);
			});
		});
	});
});
