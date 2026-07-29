import { Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';
import { nip19 } from 'nostr-tools';
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
			return info.manufacturer && info.model
				? `${info.manufacturer} ${info.model}`
				: 'Android Device'; // e.g. "Samsung Galaxy S21"
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
	const navWithUAData = navigator as Navigator & { userAgentData?: { platform?: string } };
	const platform = navWithUAData.userAgentData?.platform || navigator.platform || 'unknown';
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
	} else if (userAgent.indexOf('Chrome') > -1) {
		browser.name = 'Chrome';
	} else if (userAgent.indexOf('Firefox') > -1) {
		browser.name = 'Firefox';
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
	// toBufferSource equivalent: WebCrypto subtle methods are strict about BufferSource vs ArrayBufferLike in some TS environments
	const hashBuffer = await crypto.subtle.digest(
		'SHA-256',
		data.buffer instanceof ArrayBuffer ? data : new Uint8Array(data)
	);
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

/**
 * Create a user-friendly identifier from public key (handles both hex and npub formats)
 */
export function createUserFriendlyName(publicKey: string): string {
	if (publicKey.startsWith('npub')) {
		// For npub format, take meaningful part after 'npub'
		const npubPart = publicKey.slice(4); // Remove 'npub' prefix
		const prefix = npubPart.slice(0, 8);
		const suffix = npubPart.slice(-6); // Take last 6 chars (before checksum)
		return `npub${prefix}...${suffix}`;
	} else {
		// For hex format, take first 8 and last 8 characters
		const prefix = publicKey.slice(0, 8);
		const suffix = publicKey.slice(-8);
		return `${prefix}...${suffix}`;
	}
}

/**
 * Create a user-friendly device short name
 */
export async function createUserDeviceShortName(publicKey: string): Promise<string> {
	const deviceName = await getDeviceName();

	if (publicKey.startsWith('npub')) {
		// For npub format, take meaningful part after 'npub'
		const npubPart = publicKey.slice(4); // Remove 'npub' prefix
		const prefix = npubPart.slice(0, 8);
		return `${deviceName}-${prefix}`;
	} else {
		// For hex format, take first 8 and last 8 characters
		const prefix = publicKey.slice(0, 8);
		return `${deviceName}-${prefix}`;
	}
}

/**
 * Extract the first 6 characters after "npub" from an npub string
 * Used as a fallback for passkey naming when username and display name are not available
 * @param npub - Nostr public key in npub format (e.g., "npub1abc123...")
 * @returns First 6 characters after "npub" prefix, or empty string if not in npub format
 */
export function getNpubShortId(npub: string): string {
	if (npub.startsWith('npub')) {
		// Remove 'npub' prefix and take first 6 characters
		const npubPart = npub.slice(4); // Remove 'npub' prefix
		return npubPart.slice(0, 6);
	}
	// If not in npub format, return empty string
	return '';
}

/**
 * @param npub - Nostr public key in npub format (e.g., "npub1abc123...")
 * First check for display name in nostr, if not available use device name
 * @returns Passkey name in email format (e.g., "npub1abc123...@bittasker.com")
 */
export async function generatePasskeyName(npub: string): Promise<{
	displayName: string;
	name: string;
}> {
	let passkeyName = '';

	let decodedNpub = npub; // 64 character hex
	if (npub.startsWith('npub')) {
		decodedNpub = nip19.decode(npub).data as string;
	}

	const { getProfileEvent } = await import('$lib/nostr/profile');
	const metadataEvent = await getProfileEvent(decodedNpub);
	if (metadataEvent) {
		const metadata = JSON.parse(metadataEvent.content);
		passkeyName = metadata.display_name || metadata.displayName || metadata.name;
	}

	const deviceShortName = await createUserDeviceShortName(decodedNpub);

	return {
		displayName: (passkeyName?.trim() || deviceShortName) + '@bittasker.com',
		name: deviceShortName
	};
}

/**
 * Create display name with timestamp for uniqueness
 */
export function createDisplayName(publicKey: string, customName?: string): string {
	if (customName) {
		return `BitTasker ${customName}`;
	}

	const friendlyId = createUserFriendlyName(publicKey);
	const date = new Date().toLocaleDateString();
	return `BitTasker ${friendlyId} (${date})`;
}

/**
 * Format passkey name as email-like identifier: <username|displayname|first 6 chars of npub>@bittasker.com
 * Uses the format but doesn't enforce strict email validation - it's just borrowing the format.
 *
 * @param npub - Nostr public key (hex or npub format)
 * @param username - Optional username (highest priority)
 * @param displayName - Optional display name (second priority)
 * @returns Formatted passkey name in email format (e.g., "John.Doe@bittasker.com")
 */
export async function formatPasskeyName({
	npub,
	username,
	displayName
}: {
	npub: string;
	username?: string | null;
	displayName?: string | null;
}): Promise<string> {
	// Validate npub is non-empty and has length > 0
	if (!npub || npub.length === 0) {
		// When npub is empty, directly return "Unknown" (no point trying device name)
		return 'Unknown@bittasker.com';
	}

	let namePart: string | null = null;

	// Priority 1: Username (keep original case)
	if (username?.trim()) {
		namePart = username.trim();
	}
	// Priority 2: Display name (keep original case)
	else if (displayName?.trim()) {
		namePart = displayName.trim();
	}
	// Priority 3: First 6 characters of npub
	else {
		// Convert hex to npub format if needed
		if (npub.startsWith('npub')) {
			const npubShortId = getNpubShortId(npub);
			if (npubShortId && npubShortId.length > 0) {
				namePart = npubShortId;
			} else {
				// If getNpubShortId returns empty, use slice from npub
				namePart = npub.length > 10 ? npub.slice(4, 10) : npub.slice(4);
			}
		} else {
			// For hex format, encode it to npub
			try {
				const npubFormatted = nip19.npubEncode(npub);
				const npubShortId = getNpubShortId(npubFormatted);
				if (npubShortId && npubShortId.length > 0) {
					namePart = npubShortId;
				} else {
					// Fallback: use first 6 chars of hex
					namePart = npub.length >= 6 ? npub.slice(0, 6) : npub;
				}
			} catch {
				// Fallback: use first 6 chars of hex
				namePart = npub.length >= 6 ? npub.slice(0, 6) : npub;
			}
		}
	}

	// If we still don't have a valid namePart, fallback to device name
	if (!namePart || namePart.length === 0) {
		try {
			const deviceName = await createUserDeviceShortName(npub);
			namePart = deviceName;
		} catch {
			namePart = 'Unknown';
		}
	}

	// Return in email format (no sanitization - keep as is)
	return `${namePart}@bittasker.com`;
}
