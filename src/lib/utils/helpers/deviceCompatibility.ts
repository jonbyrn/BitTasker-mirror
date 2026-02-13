/**
 * Device and OS Compatibility Detection for Passkey/WebAuthn
 * Provides device-specific compatibility information and troubleshooting guidance
 */

import { Capacitor } from '@capacitor/core';
import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type DeviceOS = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown';
export type BrowserType = 'safari' | 'chrome' | 'firefox' | 'edge' | 'opera' | 'unknown';
export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export interface DeviceInfo {
	platform: 'ios' | 'android' | 'web';
	os: DeviceOS;
	browser: BrowserType;
	deviceType: DeviceType;
	isNative: boolean;
	isWebAuthnSupported: boolean;
	isPasskeySupported: boolean;
	requiresHTTPS: boolean;
	compatibilityNotes: string[];
}

/**
 * Detect the operating system from user agent
 */
export function detectOS(): DeviceOS {
	if (!browser) return 'unknown';

	const userAgent = navigator.userAgent.toLowerCase();
	const platform = navigator.platform?.toLowerCase() || '';

	// iOS detection
	if (/iphone|ipad|ipod/.test(userAgent) || platform.includes('iphone') || platform.includes('ipad')) {
		return 'ios';
	}

	// Android detection
	if (/android/.test(userAgent) || platform.includes('android')) {
		return 'android';
	}

	// macOS detection
	if (/macintosh|mac os x/.test(userAgent) || platform.includes('mac')) {
		return 'macos';
	}

	// Windows detection
	if (/windows/.test(userAgent) || platform.includes('win')) {
		return 'windows';
	}

	// Linux detection
	if (/linux/.test(userAgent) || platform.includes('linux') || platform.includes('x11')) {
		return 'linux';
	}

	return 'unknown';
}

/**
 * Detect the browser type
 */
export function detectBrowser(): BrowserType {
	if (!browser) return 'unknown';

	const userAgent = navigator.userAgent.toLowerCase();

	// Safari (but not Chrome on iOS)
	if (/safari/.test(userAgent) && !/chrome/.test(userAgent) && !/crios/.test(userAgent) && !/fxios/.test(userAgent)) {
		return 'safari';
	}

	// Chrome
	if (/chrome/.test(userAgent) && !/edg/.test(userAgent)) {
		return 'chrome';
	}

	// Edge
	if (/edg/.test(userAgent) || /edge/.test(userAgent)) {
		return 'edge';
	}

	// Firefox
	if (/firefox/.test(userAgent) || /fxios/.test(userAgent)) {
		return 'firefox';
	}

	// Opera
	if (/opera|opr/.test(userAgent)) {
		return 'opera';
	}

	return 'unknown';
}

/**
 * Detect device type (mobile, tablet, desktop)
 */
export function detectDeviceType(): DeviceType {
	if (!browser) return 'unknown';

	const userAgent = navigator.userAgent.toLowerCase();
	const platform = navigator.platform?.toLowerCase() || '';

	// Mobile detection
	if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
		return 'mobile';
	}

	// Tablet detection
	if (/tablet|ipad|playbook|silk/i.test(userAgent) || (platform.includes('mac') && 'ontouchend' in document)) {
		return 'tablet';
	}

	// Default to desktop
	return 'desktop';
}

/**
 * Check if WebAuthn is supported on this device/browser
 */
export function isWebAuthnSupported(): boolean {
	if (!browser) return false;

	// Check for WebAuthn API
	if (typeof window.PublicKeyCredential === 'undefined') {
		return false;
	}

	// Check if platform authenticator is available (for passkeys)
	try {
		// This is async, but we can check if the API exists
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if Passkeys are supported (requires platform authenticator)
 */
export async function isPasskeySupported(): Promise<boolean> {
	if (!browser) return false;

	if (!isWebAuthnSupported()) {
		return false;
	}

	try {
		// Check if platform authenticator is available
		const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
		return available;
	} catch {
		return false;
	}
}

/**
 * Detects when the user is on iOS web using a non-Safari browser (e.g. Chrome, Brave).
 * These browsers use Google Password Manager for passkeys; Chrome must be set as the
 * autofill provider in Settings → General → AutoFill & Passwords.
 *
 * Returns true only when: iOS + non-Safari browser + web (not native app).
 * Returns false for: Android, PC, iOS Safari, iOS native app — standard flow unchanged.
 */
export function isIosWebNonSafari(): boolean {
	if (!browser) return false;
	const os = detectOS();
	const browserType = detectBrowser();
	return os === 'ios' && browserType !== 'safari' && !Capacitor.isNativePlatform();
}

/**
 * Reactive store for iOS Chrome/Brave passkey hint visibility.
 * Initialize once on app load via initShowIosPasskeyHint() in +layout.svelte.
 */
export const showIosPasskeyHintStore = writable(false);

/** Call once on client mount to initialize the store. */
export function initShowIosPasskeyHint(): void {
	if (browser) {
		showIosPasskeyHintStore.set(isIosWebNonSafari());
	}
}

/**
 * Check if hostname is an IP address (invalid for WebAuthn rpId).
 * WebAuthn spec requires rpId to be a valid domain string; IP addresses are rejected.
 */
export function isInvalidRpIdHostname(): boolean {
	if (!browser || typeof window === 'undefined') return false;
	const host = window.location.hostname;
	// IPv4 pattern (e.g. 192.168.1.23)
	if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
	// IPv6 pattern (simplified)
	if (host.includes(':') || host.startsWith('[')) return true;
	return false;
}

/**
 * Check if HTTPS is required (WebAuthn requires secure context)
 */
export function requiresHTTPS(): boolean {
	if (!browser) return false;

	// WebAuthn requires secure context (HTTPS or localhost)
	return location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
}

/**
 * Get comprehensive device compatibility information
 */
export async function getDeviceCompatibility(): Promise<DeviceInfo> {
	const isNative = Capacitor.isNativePlatform();
	const capacitorPlatform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
	
	const os = detectOS();
	const browser = detectBrowser();
	const deviceType = detectDeviceType();
	const webAuthnSupported = isWebAuthnSupported();
	const passkeySupported = await isPasskeySupported();
	const needsHTTPS = requiresHTTPS();

	const compatibilityNotes: string[] = [];

	// Platform-specific notes
	if (isNative) {
		if (capacitorPlatform === 'ios') {
			compatibilityNotes.push('Native iOS app - uses Touch ID/Face ID');
		} else if (capacitorPlatform === 'android') {
			compatibilityNotes.push('Native Android app - uses fingerprint/face unlock');
		}
	} else {
		// Web platform notes
		if (os === 'ios') {
			if (browser === 'safari') {
				compatibilityNotes.push('iOS Safari - uses iCloud Keychain for passkeys');
			} else {
				// Chrome, Brave on iOS - use Google Password Manager (enable Chrome in AutoFill & Passwords)
				compatibilityNotes.push('iOS Chrome/Brave - enable Chrome in Settings → AutoFill & Passwords for passkeys');
			}
		} else if (os === 'android') {
			if (browser === 'chrome') {
				compatibilityNotes.push('Android Chrome - uses Google Password Manager for passkeys');
			} else {
				compatibilityNotes.push('Android browser - may have limited passkey support');
			}
		} else if (os === 'windows') {
			if (browser === 'edge') {
				compatibilityNotes.push('Windows Edge - uses Windows Hello for passkeys');
			} else if (browser === 'chrome') {
				compatibilityNotes.push('Windows Chrome - uses Windows Hello for passkeys');
			}
		} else if (os === 'macos') {
			if (browser === 'safari') {
				compatibilityNotes.push('macOS Safari - uses Touch ID/Apple Watch for passkeys');
			} else if (browser === 'chrome') {
				compatibilityNotes.push('macOS Chrome - uses Touch ID for passkeys');
			}
		}

		if (needsHTTPS) {
			compatibilityNotes.push('HTTPS required for WebAuthn - current connection is not secure');
		}
	}

	return {
		platform: capacitorPlatform,
		os,
		browser,
		deviceType,
		isNative,
		isWebAuthnSupported: webAuthnSupported,
		isPasskeySupported: passkeySupported,
		requiresHTTPS: needsHTTPS,
		compatibilityNotes
	};
}

/**
 * Get device-specific troubleshooting steps based on OS and browser
 * Returns translation keys that should be translated in the component
 */
export function getDeviceSpecificTroubleshooting(
	deviceInfo: DeviceInfo,
	errorType: string
): string[] {
	const steps: string[] = [];

	// Only show device-specific steps for biometric errors
	if (errorType !== 'biometric') {
		return steps;
	}

	// iOS-specific troubleshooting
	if (deviceInfo.os === 'ios') {
		if (deviceInfo.isNative) {
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_native_biometric_1');
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_native_biometric_2');
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_native_biometric_3');
			// Add lockout and passcode steps for relevant errors
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_native_biometric_4');
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_native_biometric_5');
		} else {
			// iOS Web
			if (deviceInfo.browser === 'safari') {
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_web_safari_1');
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_web_safari_2');
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_web_safari_3');
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_web_safari_4');
			} else {
				// Chrome, Brave on iOS - need Chrome/Brave as autofill provider for Google Password Manager
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_web_other_1');
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_web_other_2');
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_web_other_3');
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_web_other_4');
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.ios_web_other_5');
			}
		}
	}

	// Android-specific troubleshooting
	if (deviceInfo.os === 'android') {
		if (deviceInfo.isNative) {
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.android_native_biometric_1');
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.android_native_biometric_2');
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.android_native_biometric_3');
			// Add lockout and screen lock steps
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.android_native_biometric_4');
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.android_native_biometric_5');
		} else {
			// Android Web
			if (deviceInfo.browser === 'chrome') {
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.android_web_chrome_1');
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.android_web_chrome_2');
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.android_web_chrome_3');
			} else {
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.android_web_other_1');
				steps.push('common.components.error_troubleshooting_modal.device_specific_steps.android_web_other_2');
			}
		}
	}

	// Windows-specific troubleshooting
	if (deviceInfo.os === 'windows') {
		if (deviceInfo.browser === 'edge') {
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.windows_edge_1');
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.windows_edge_2');
		} else if (deviceInfo.browser === 'chrome') {
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.windows_chrome_1');
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.windows_chrome_2');
		}
	}

	// macOS-specific troubleshooting
	if (deviceInfo.os === 'macos') {
		if (deviceInfo.browser === 'safari') {
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.macos_safari_1');
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.macos_safari_2');
		} else if (deviceInfo.browser === 'chrome') {
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.macos_chrome_1');
			steps.push('common.components.error_troubleshooting_modal.device_specific_steps.macos_chrome_2');
		}
	}

	// HTTPS requirement
	if (deviceInfo.requiresHTTPS && !deviceInfo.isNative) {
		steps.push('common.components.error_troubleshooting_modal.device_specific_steps.https_required_1');
		steps.push('common.components.error_troubleshooting_modal.device_specific_steps.https_required_2');
	}

	// WebAuthn not supported
	if (!deviceInfo.isWebAuthnSupported && !deviceInfo.isNative) {
		steps.push('common.components.error_troubleshooting_modal.device_specific_steps.webauthn_not_supported_1');
		steps.push('common.components.error_troubleshooting_modal.device_specific_steps.webauthn_not_supported_2');
	}

	return steps;
}

