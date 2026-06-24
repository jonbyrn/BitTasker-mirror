import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	getSettingsAction,
	getSettingsInstructions,
	openDeviceSettings
} from '$lib/utils/helpers/deviceSettings';

vi.mock('@capacitor/core', () => ({
	Capacitor: { getPlatform: vi.fn(() => 'web') }
}));

vi.mock('@capacitor/browser', () => ({
	Browser: { open: vi.fn() }
}));

describe('deviceSettings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getSettingsAction', () => {
		it('should return null for web platform', () => {
			expect(getSettingsAction('windows', 'web')).toBeNull();
			expect(getSettingsAction('ios', 'web')).toBeNull();
			expect(getSettingsAction('android', 'web')).toBeNull();
		});

		it('should return action for native iOS with biometric error', () => {
			const result = getSettingsAction('ios', 'ios', 'biometric');
			expect(result).not.toBeNull();
			expect(result!.label).toBe('Open Touch ID & Passcode Settings');
			expect(result!.available).toBe(true);
			expect(typeof result!.action).toBe('function');
		});

		it('should return action for native Android with biometric error', () => {
			const result = getSettingsAction('android', 'android', 'biometric');
			expect(result!.label).toBe('Open Biometric Settings');
		});

		it('should return action for permission error', () => {
			const result = getSettingsAction('ios', 'ios', 'permission');
			expect(result!.label).toBe('Open Privacy Settings');
		});

		it('should return action for hardware error', () => {
			const result = getSettingsAction('android', 'android', 'hardware');
			expect(result!.label).toBe('Open Security Settings');
		});

		it('should return generic Open Settings for other error types', () => {
			const result = getSettingsAction('ios', 'ios');
			expect(result!.label).toBe('Open Settings');
		});
	});

	describe('getSettingsInstructions', () => {
		it('should return iOS native biometric instructions', () => {
			const result = getSettingsInstructions('ios', 'ios', 'biometric');
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toContain('ios_native_biometric');
		});

		it('should return Android native biometric instructions', () => {
			const result = getSettingsInstructions('android', 'android', 'biometric');
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toContain('android_native_biometric');
		});

		it('should return web instructions for web platform', () => {
			const result = getSettingsInstructions('windows', 'web');
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toContain('web_windows');
		});

		it('should return web iOS instructions when os is ios and platform is web', () => {
			const result = getSettingsInstructions('ios', 'web');
			expect(result.some((s) => s.includes('web_ios'))).toBe(true);
		});

		it('should return web macOS instructions', () => {
			const result = getSettingsInstructions('macos', 'web');
			expect(result.some((s) => s.includes('web_macos'))).toBe(true);
		});
	});

	describe('openDeviceSettings', () => {
		it('should throw for web platform', async () => {
			await expect(openDeviceSettings('windows', 'web')).rejects.toThrow(
				'Cannot open device settings from web browser'
			);
		});
	});
});
