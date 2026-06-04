/**
 * Browser-safe `crypto` shim (Web Crypto only — no elliptic / crypto-browserify).
 */
import { Buffer } from 'buffer';

export function randomBytes(size: number): Buffer {
	const bytes = new Uint8Array(size);
	crypto.getRandomValues(bytes);
	return Buffer.from(bytes);
}
