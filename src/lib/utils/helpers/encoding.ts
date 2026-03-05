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
	const exportedKeyBytes = Uint8Array.from(atob(exportedKey), (c) => c.charCodeAt(0));

	// Check if both fit exactly in 64 bytes
	if (pubKeyBytes.length + exportedKeyBytes.length > 64) {
		throw new Error(
			`Data too large: ${pubKeyBytes.length + exportedKeyBytes.length} bytes (max 64)`
		);
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

/**
 * Generate a unique credential ID for mobile biometric authentication
 * This mimics WebAuthn's credential ID generation
 */
export function generateCredentialId(): string {
	const randomBytes = crypto.getRandomValues(new Uint8Array(32));
	return bytesToBase64(randomBytes);
}

/**
 * Generate a unique challenge for mobile WebAuthn (string format)
 */
export function generateMobileChallenge(): string {
	const arr = new Uint8Array(32);
	crypto.getRandomValues(arr);
	// Convert to base64url format
	return btoa(String.fromCharCode(...arr))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

/**
 * Generate a unique challenge for web WebAuthn (ArrayBuffer format)
 */
export function generateWebChallenge(): ArrayBuffer {
	const arr = new Uint8Array(32);
	crypto.getRandomValues(arr);
	return arr.buffer;
}

/**
 * Extracts the public key (as SPKI DER bytes) from a base64url-encoded attestationObject.
 * Works without any external CBOR library by implementing a minimal CBOR decoder
 * sufficient for the WebAuthn attestationObject structure.
 *
 * The attestationObject is CBOR-encoded:
 *   { fmt: string, attStmt: map, authData: bytes }
 *
 * authData binary layout:
 *   [0..31]    rpIdHash (32 bytes)
 *   [32]       flags
 *   [33..36]   signCount (uint32 BE)
 *   [37..52]   aaguid (16 bytes)
 *   [53..54]   credentialIdLength (uint16 BE)
 *   [55..55+L] credentialId
 *   [55+L..]   credentialPublicKey (COSE CBOR map)
 *
 * COSE ES256 key map (-7):
 *   1  → 2   (kty: EC2)
 *   3  → -7  (alg: ES256)
 *  -1  → 1   (crv: P-256)
 *  -2  → x   (32 bytes)
 *  -3  → y   (32 bytes)
 *
 * Returns the public key as a Uint8Array in SPKI DER format (same as getPublicKey()).
 */
export function extractPublicKeyFromAttestationObject(
	attestationObjectB64url: string
): Uint8Array | null {
	// 1. Base64url → bytes
	const base64 = attestationObjectB64url.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

	// 2. Minimal CBOR decoder — returns [value, nextOffset]
	function decodeCBOR(buf: Uint8Array, offset: number): [unknown, number] {
		const initialByte = buf[offset++];
		const majorType = (initialByte >> 5) & 0x07;
		const additionalInfo = initialByte & 0x1f;

		let length = additionalInfo;
		if (additionalInfo === 24) {
			length = buf[offset++];
		} else if (additionalInfo === 25) {
			length = (buf[offset] << 8) | buf[offset + 1];
			offset += 2;
		} else if (additionalInfo === 26) {
			length =
				(buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
			offset += 4;
		}

		if (majorType === 0) return [length, offset]; // unsigned int
		if (majorType === 1) return [-(1 + length), offset]; // negative int
		if (majorType === 2) {
			// byte string
			const slice = buf.slice(offset, offset + length);
			return [slice, offset + length];
		}
		if (majorType === 3) {
			// text string
			const slice = buf.slice(offset, offset + length);
			return [new TextDecoder().decode(slice), offset + length];
		}
		if (majorType === 4) {
			// array
			const arr: unknown[] = [];
			for (let i = 0; i < length; i++) {
				const [val, next] = decodeCBOR(buf, offset);
				arr.push(val);
				offset = next;
			}
			return [arr, offset];
		}
		if (majorType === 5) {
			// map
			const map = new Map<unknown, unknown>();
			for (let i = 0; i < length; i++) {
				const [key, next1] = decodeCBOR(buf, offset);
				const [val, next2] = decodeCBOR(buf, next1);
				map.set(key, val);
				offset = next2;
			}
			return [map, offset];
		}
		throw new Error(`Unsupported CBOR major type: ${majorType}`);
	}

	// 3. Decode the outer attestationObject map
	const [attestationMap] = decodeCBOR(bytes, 0) as [Map<string, unknown>, number];
	const authData = attestationMap.get('authData') as Uint8Array | undefined;
	if (!authData) return null;

	// 4. Parse authData to find the credentialPublicKey offset
	if (authData.length < 55) return null;
	const credentialIdLength = (authData[53] << 8) | authData[54];
	const coseKeyOffset = 55 + credentialIdLength;
	if (authData.length <= coseKeyOffset) return null;

	// 5. Decode the COSE key map
	const coseKeyBytes = authData.slice(coseKeyOffset);
	const [coseKey] = decodeCBOR(coseKeyBytes, 0) as [Map<number, unknown>, number];

	// 6. Extract x and y coordinates (COSE keys -2 and -3)
	const x = coseKey.get(-2) as Uint8Array | undefined;
	const y = coseKey.get(-3) as Uint8Array | undefined;
	if (!x || !y || x.length !== 32 || y.length !== 32) return null;

	// 7. Build SPKI DER for EC P-256 public key
	// This matches exactly what browser's getPublicKey() returns
	// SPKI = SEQUENCE { AlgorithmIdentifier { OID ecPublicKey, OID P-256 }, BIT STRING { 0x04 || x || y } }
	const ecOid = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]); // OID 1.2.840.10045.2.1 (ecPublicKey)
	const p256Oid = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]); // OID 1.2.840.10045.3.1.7 (P-256)

	// AlgorithmIdentifier SEQUENCE
	const algoInner = new Uint8Array([
		0x06,
		ecOid.length,
		...ecOid,
		0x06,
		p256Oid.length,
		...p256Oid
	]);
	const algoSeq = new Uint8Array([0x30, algoInner.length, ...algoInner]);

	// BIT STRING containing 0x04 || x || y (uncompressed point)
	const point = new Uint8Array([0x04, ...x, ...y]);
	const bitString = new Uint8Array([0x03, point.length + 1, 0x00, ...point]);

	// Outer SEQUENCE
	const spkiInner = new Uint8Array([...algoSeq, ...bitString]);
	const spki = new Uint8Array([0x30, spkiInner.length, ...spkiInner]);

	return spki;
}
