import { Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '../constants/storage';

/**
 * Get unique device identifier for biometric authentication
 * Uses actual device hardware identifiers when available
 */
export async function getDeviceIdentifier(): Promise<string> {
	try {
		// First check if we've already stored a device ID
		const { value: storedId } = await Preferences.get({ key: StorageKeys.DEVICE_UNIQUE_ID });
		if (storedId) {
			return storedId;
		}

		// Get device info from Capacitor
		const info = await Device.getInfo();
		const id = await Device.getId();

		// Create a device identifier using real hardware information
		let deviceId: string;

		if (id.identifier && id.identifier !== 'unknown') {
			// Use the device identifier if available (most secure option)
			deviceId = id.identifier;
		} else if (info.platform === 'ios') {
			// For iOS, use vendor identifier + model + OS version
			deviceId = `ios_${info.model}_${info.osVersion}`;
		} else if (info.platform === 'android') {
			// For Android, combine model + manufacturer + OS version
			deviceId = `android_${info.manufacturer}_${info.model}_${info.osVersion}`;
		} else {
			// For web/desktop, create a persistent browser fingerprint
			deviceId = await generateBrowserFingerprint();
		}

		// Store the device ID for future use
		await Preferences.set({
			key: StorageKeys.DEVICE_UNIQUE_ID,
			value: deviceId
		});

		return deviceId;
	} catch (error) {
		console.error('Error getting device identifier:', error);
		// Fallback to a random ID if device info can't be accessed
		const fallbackId = generateRandomId();
		await Preferences.set({
			key: StorageKeys.DEVICE_UNIQUE_ID,
			value: fallbackId
		});
		return fallbackId;
	}
}

/**
 * Get descriptive device name for display
 */
export async function getDeviceName(): Promise<string> {
	try {
		const info = await Device.getInfo();

		// Create a user-friendly device name
		if (info.platform === 'ios') {
			return info.model || 'iOS Device'; // e.g. "iPhone 13 Pro"
		} else if (info.platform === 'android') {
			return `${info.manufacturer} ${info.model}` || 'Android Device'; // e.g. "Samsung Galaxy S21"
		} else if (info.platform === 'web') {
			// For web, use browser info
			const browser = getBrowserInfo();
			return `${browser.name} on ${info.operatingSystem}`;
		} else {
			return info.model || 'Unknown Device';
		}
	} catch (error) {
		console.error('Error getting device name:', error);
		return 'Unknown Device';
	}
}

interface BrowserInfo {
	name: string;
	version: string;
}

/**
 * Generate a browser fingerprint for web platforms
 * This is a simplified version - in production you might use more signals
 */
async function generateBrowserFingerprint(): Promise<string> {
	const userAgent = navigator.userAgent;
	// @ts-ignore
	const platform = navigator?.userAgentData?.platform || navigator.platform || 'unknown';
	const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const languages = navigator.languages ? navigator.languages.join(',') : navigator.language;
	const browser = getBrowserInfo();

	// Combine all data points for maximum entropy
	const deviceData = `${userAgent}_${platform}_${screenInfo}_${timezone}_${languages}_${browser.name}_${browser.version}_BitTasker`;

	// Generate a hash of these properties for a fingerprint
	const fingerprint = await sha256(deviceData);
	return `web_${fingerprint.substring(0, 16)}`;
}

/**
 * Get browser name and version
 */
function getBrowserInfo(): BrowserInfo {
	const userAgent = navigator.userAgent;
	const browser: BrowserInfo = { name: 'Unknown', version: 'Unknown' };

	if (userAgent.indexOf('Edge') > -1) {
		browser.name = 'Edge';
	} else if (userAgent.indexOf('Firefox') > -1) {
		browser.name = 'Firefox';
	} else if (userAgent.indexOf('Chrome') > -1) {
		browser.name = 'Chrome';
	} else if (userAgent.indexOf('Safari') > -1) {
		browser.name = 'Safari';
	} else if (userAgent.indexOf('MSIE') > -1 || userAgent.indexOf('Trident/') > -1) {
		browser.name = 'Internet Explorer';
	}

	// Extract version (simplified)
	const match = userAgent.match(new RegExp(`${browser.name}\\/([0-9\\.]+)`));
	if (match) browser.version = match[1];

	return browser;
}

/**
 * Generate SHA-256 hash
 */
async function sha256(text: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(text);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random ID (fallback method)
 */
function generateRandomId(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/* export async function getEnhancedDeviceIdentifier(): Promise<string> {
	// Get all device characteristics
	const userAgent = navigator.userAgent;
	// @ts-ignore
	const platform = navigator?.userAgentData?.platform || navigator.platform || 'unknown';
	const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const languages = navigator.languages ? navigator.languages.join(',') : navigator.language;
	const browserInfo = getBrowserInfo();

	// Combine all data points for maximum entropy
	const deviceData = `${userAgent}_${platform}_${screenInfo}_${timezone}_${languages}_${browserInfo.name}_${browserInfo.version}_BitTasker`;

	// Generate SHA-256 hash
	const encoder = new TextEncoder();
	const data = encoder.encode(deviceData);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);

	// Convert to hex string
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
} */