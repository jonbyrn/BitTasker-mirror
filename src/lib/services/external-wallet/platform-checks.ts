/**
 * Platform Checks — Determine which wallet connectors are available
 * on the current platform/browser.
 *
 * All functions accept `navigator` and platform info explicitly — no globals.
 */

import { Capacitor } from '@capacitor/core';

export interface PlatformInfo {
	isNative: boolean;
	platform: string | null;
	hasUsb: boolean;
	hasBluetooth: boolean;
}

export function getPlatformInfo(navigator: Navigator): PlatformInfo {
	return {
		isNative: Capacitor.isNativePlatform(),
		platform: Capacitor.getPlatform(),
		hasUsb: typeof navigator !== 'undefined' && 'usb' in navigator,
		hasBluetooth: typeof navigator !== 'undefined' && 'bluetooth' in navigator
	};
}

/** MetaMask is available if window.ethereum?.isMetaMask is truthy */
export function isMetaMaskAvailable(): boolean {
	if (typeof window === 'undefined') return false;
	const ethereum = (window as { ethereum?: { isMetaMask?: boolean } }).ethereum;
	return !!ethereum?.isMetaMask;
}

/** Trezor is available on desktop and Android (USB OTG). Not on iOS. */
export function isTrezorAvailable(info: PlatformInfo): boolean {
	if (info.platform === 'ios') return false;
	if (info.isNative && info.platform === 'android') return true; // USB OTG
	return !info.isNative; // Desktop browser
}

/** Ledger transport: BLE on mobile, WebUSB on desktop, unavailable on iOS. */
export function getLedgerTransport(info: PlatformInfo): 'webusb' | 'ble' | 'unavailable' {
	if (info.platform === 'ios') {
		return info.hasBluetooth ? 'ble' : 'unavailable';
	}
	if (info.isNative) {
		return 'ble'; // Android: BLE more reliable than WebUSB in WebView
	}
	return info.hasUsb ? 'webusb' : 'unavailable';
}
