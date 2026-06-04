/**
 * Minimal crypto-browserify replacement for npm audit (no elliptic).
 * Vite resolves `crypto` to ../crypto.ts; this satisfies node-stdlib-browser's dependency slot.
 */
import { Buffer } from 'buffer';

export function randomBytes(size) {
	const bytes = new Uint8Array(size);
	globalThis.crypto.getRandomValues(bytes);
	return Buffer.from(bytes);
}

export default { randomBytes };
