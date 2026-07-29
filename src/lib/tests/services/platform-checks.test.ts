import { describe, it, expect, beforeEach } from 'vitest';
import {
	getPlatformInfo,
	isMetaMaskAvailable,
	isTrezorAvailable,
	getLedgerTransport
} from '$lib/services/external-wallet/platform-checks';
import type { PlatformInfo } from '$lib/services/external-wallet/platform-checks';

// Helper to build a minimal Navigator stub
function stubNavigator(overrides: Record<string, unknown> = {}): Navigator {
	return {
		...overrides
	} as unknown as Navigator;
}

describe('platform-checks', () => {
	// ------------------------------------------------------------------
	// getPlatformInfo
	// ------------------------------------------------------------------
	describe('getPlatformInfo', () => {
		it('returns desktop-web info when Capacitor reports web platform', () => {
			const info = getPlatformInfo(stubNavigator({ usb: {}, bluetooth: {} }));
			expect(info.isNative).toBe(false);
			expect(info.platform).toBe('web');
			expect(info.hasUsb).toBe(true);
			expect(info.hasBluetooth).toBe(true);
		});

		it('returns hasUsb=false when navigator lacks usb', () => {
			const info = getPlatformInfo(stubNavigator({}));
			expect(info.hasUsb).toBe(false);
		});

		it('returns hasBluetooth=false when navigator lacks bluetooth', () => {
			const info = getPlatformInfo(stubNavigator({}));
			expect(info.hasBluetooth).toBe(false);
		});

		it('reports isNative=false and platform=web from global Capacitor mock', () => {
			// The vitest setup mocks Capacitor to isNative=false, platform='web'
			const info = getPlatformInfo(stubNavigator({}));
			expect(info.isNative).toBe(false);
			expect(info.platform).toBe('web');
		});
	});

	// ------------------------------------------------------------------
	// isMetaMaskAvailable
	// ------------------------------------------------------------------
	describe('isMetaMaskAvailable', () => {
		beforeEach(() => {
			// Ensure window.ethereum is undefined before each test
			delete (window as { ethereum?: unknown }).ethereum;
		});

		it('returns true when window.ethereum.isMetaMask is truthy', () => {
			(window as { ethereum?: { isMetaMask?: boolean } }).ethereum = { isMetaMask: true };
			expect(isMetaMaskAvailable()).toBe(true);
		});

		it('returns false when window.ethereum is present but isMetaMask is false', () => {
			(window as { ethereum?: { isMetaMask?: boolean } }).ethereum = { isMetaMask: false };
			expect(isMetaMaskAvailable()).toBe(false);
		});

		it('returns false when window.ethereum is undefined', () => {
			expect(isMetaMaskAvailable()).toBe(false);
		});

		it('returns false when window.ethereum is null', () => {
			(window as { ethereum?: null }).ethereum = null;
			expect(isMetaMaskAvailable()).toBe(false);
		});

		it('returns false when window.ethereum is an empty object without isMetaMask', () => {
			(window as { ethereum?: { isMetaMask?: boolean } }).ethereum = {};
			expect(isMetaMaskAvailable()).toBe(false);
		});
	});

	// ------------------------------------------------------------------
	// isTrezorAvailable
	// ------------------------------------------------------------------
	describe('isTrezorAvailable', () => {
		it('returns true for desktop web platform', () => {
			const info: PlatformInfo = {
				isNative: false,
				platform: 'web',
				hasUsb: false,
				hasBluetooth: false
			};
			expect(isTrezorAvailable(info)).toBe(true);
		});

		it('returns true for Android native platform', () => {
			const info: PlatformInfo = {
				isNative: true,
				platform: 'android',
				hasUsb: false,
				hasBluetooth: false
			};
			expect(isTrezorAvailable(info)).toBe(true);
		});

		it('returns false for iOS', () => {
			const info: PlatformInfo = {
				isNative: true,
				platform: 'ios',
				hasUsb: false,
				hasBluetooth: false
			};
			expect(isTrezorAvailable(info)).toBe(false);
		});

		it('returns true for non-native platform even when platform is not web (e.g., electron)', () => {
			// The function returns true for ANY non-native, non-iOS platform
			const info: PlatformInfo = {
				isNative: false,
				platform: 'electron',
				hasUsb: false,
				hasBluetooth: false
			};
			expect(isTrezorAvailable(info)).toBe(true);
		});

		it('returns true for non-native platform that is not iOS (e.g., desktop browser)', () => {
			const info: PlatformInfo = {
				isNative: false,
				platform: 'web',
				hasUsb: true,
				hasBluetooth: false
			};
			expect(isTrezorAvailable(info)).toBe(true);
		});
	});

	// ------------------------------------------------------------------
	// getLedgerTransport
	// ------------------------------------------------------------------
	describe('getLedgerTransport', () => {
		it("returns 'webusb' on desktop with USB available", () => {
			const info: PlatformInfo = {
				isNative: false,
				platform: 'web',
				hasUsb: true,
				hasBluetooth: false
			};
			expect(getLedgerTransport(info)).toBe('webusb');
		});

		it("returns 'unavailable' on desktop without USB", () => {
			const info: PlatformInfo = {
				isNative: false,
				platform: 'web',
				hasUsb: false,
				hasBluetooth: false
			};
			expect(getLedgerTransport(info)).toBe('unavailable');
		});

		it("returns 'ble' on Android native", () => {
			const info: PlatformInfo = {
				isNative: true,
				platform: 'android',
				hasUsb: true,
				hasBluetooth: false
			};
			expect(getLedgerTransport(info)).toBe('ble');
		});

		it("returns 'ble' on iOS with Bluetooth", () => {
			const info: PlatformInfo = {
				isNative: true,
				platform: 'ios',
				hasUsb: false,
				hasBluetooth: true
			};
			expect(getLedgerTransport(info)).toBe('ble');
		});

		it("returns 'unavailable' on iOS without Bluetooth", () => {
			const info: PlatformInfo = {
				isNative: true,
				platform: 'ios',
				hasUsb: false,
				hasBluetooth: false
			};
			expect(getLedgerTransport(info)).toBe('unavailable');
		});

		it("returns 'ble' on other native platforms (e.g., android with BLE)", () => {
			const info: PlatformInfo = {
				isNative: true,
				platform: 'android',
				hasUsb: false,
				hasBluetooth: false
			};
			expect(getLedgerTransport(info)).toBe('ble');
		});
	});
});
