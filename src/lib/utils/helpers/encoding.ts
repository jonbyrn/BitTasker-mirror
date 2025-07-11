export function bytesToBase64(bytes: Uint8Array): string {
	return btoa(String.fromCharCode.apply(null, Array.from(bytes)));
}

export function base64ToBytes(base64: string): Uint8Array {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes;
}

/**
 * Convert bytes array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Convert hex string to bytes array
 */
export function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
	}
	return bytes;
}

/**
 * Pack public key and exported key into 64 bytes using binary optimization
 * Stores public key as raw bytes (32 bytes) + exported key as raw bytes (32 bytes)
 */
export function packKeys(publicKey: string, exportedKey: string): ArrayBuffer {
	// Convert hex public key to raw bytes (64 chars -> 32 bytes)
	const pubKeyBytes = hexToBytes(publicKey);

	// Decode base64 exported key to raw bytes
	const exportedKeyBytes = Uint8Array.from(atob(exportedKey), c => c.charCodeAt(0));

	// Check if both fit exactly in 64 bytes
	if (pubKeyBytes.length + exportedKeyBytes.length > 64) {
		throw new Error(`Data too large: ${pubKeyBytes.length + exportedKeyBytes.length} bytes (max 64)`);
	}

	// Create 64-byte buffer: 32 bytes pubkey + 32 bytes exported key
	const packed = new Uint8Array(64);
	packed.set(pubKeyBytes, 0);
	packed.set(exportedKeyBytes, 32);

	return packed.buffer;
}

/**
 * Convert base64 to base64url (more compact, URL-safe)
 */
export function base64ToBase64Url(base64: string): string {
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Convert base64url back to base64
 */
export function base64UrlToBase64(base64url: string): string {
	// Add padding if needed
	let padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
	while (padded.length % 4) {
		padded += '=';
	}
	return padded;
}

/**
 * Pack keys for mobile devices - generates the same 64-byte data as web
 * but returns it as a base64url string that fits mobile WebAuthn requirements
 */
export function packKeysMobile(publicKey: string, exportedKey: string): string {
	// Create the exact same 64-byte packed format as web
	const packedKeys = packKeys(publicKey, exportedKey);
	const packedBytes = new Uint8Array(packedKeys);
	
	// Convert to base64url (URL-safe, no padding)
	const base64 = bytesToBase64(packedBytes);
	const base64url = base64ToBase64Url(base64);
	
	// Log the length for debugging
	console.log(`Mobile packed keys length: ${base64url.length} characters`);
	
	if (base64url.length > 64) {
		console.warn(`Packed keys (${base64url.length} chars) exceed 64 character limit`);
	}
	
	return base64url;
}

/**
 * Unpack keys for mobile devices - reconstructs from the same 64-byte format
 */
export function unPackKeysMobile(packedString: string): { publicKey: string; exportedKey: string } {
	// Convert base64url back to base64
	const base64 = base64UrlToBase64(packedString);
	
	// Convert back to bytes
	const bytes = base64ToBytes(base64);
	
	// Create an ArrayBuffer from the bytes
	const buffer = new ArrayBuffer(bytes.length);
	const view = new Uint8Array(buffer);
	view.set(bytes);
	
	// Use the original unPackKeys function - this ensures exact reconstruction
	return unPackKeys(buffer);
}

/**
 * Unpack user data from 64-byte buffer (binary format)
 * Returns original public key and exported key with no data loss
 */
export function unPackKeys(userHandle: ArrayBuffer): { publicKey: string; exportedKey: string } {
	const bytes = new Uint8Array(userHandle);

	// Extract public key bytes (first 32 bytes) and convert back to hex
	const pubKeyBytes = bytes.slice(0, 32);
	const publicKey = bytesToHex(pubKeyBytes);

	// Extract exported key bytes (last 32 bytes) and remove zero padding
	const exportedKeyBytes = bytes.slice(32, 64);

	// Find the actual length by looking for the last non-zero byte
	let actualLength = 32;
	for (let i = 31; i >= 0; i--) {
		if (exportedKeyBytes[i] !== 0) {
			actualLength = i + 1;
			break;
		}
	}

	// Convert back to base64
	const actualExportedKeyBytes = exportedKeyBytes.slice(0, actualLength);
	const exportedKey = btoa(String.fromCharCode(...actualExportedKeyBytes));

	return { publicKey, exportedKey };
}