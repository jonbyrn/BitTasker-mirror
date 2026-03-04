import authService from '$lib/api/services/auth.service';
import { nip19 } from 'nostr-tools';

function toHandleBase(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '_')
		.replace(/[^a-z0-9._-]/g, '')
		.replace(/[._-]{2,}/g, (m) => m[0]) // collapse repeated separators
		.replace(/^[._-]+|[._-]+$/g, '') // strip leading/trailing separators
		.slice(0, 50);
}

/**
 * Extract last `len` chars of the npub data portion.
 * npub = "npub1" (5 chars) + data + checksum (last 6 chars)
 * We only want the data part, not the prefix or checksum.
 */
function npubDataSuffix(hexPubkey: string, len: number): string {
	const npub = nip19.npubEncode(hexPubkey);
	const data = npub.slice(5, -6); // strip "npub1" prefix and 6-char checksum
	return data.slice(-len);
}

/**
 * Derive a unique available handle from display name + hex pubkey.
 *
 * 1. Normalize display name → base (e.g. "John Doe" → "john_doe")
 * 2. If base is empty, fall back to "tasker_" + last 16 npub data chars
 * 3. Pre-trim base so base + "_" + 6-char-suffix fits within 64 chars
 * 4. Try suffix lengths 6→32: if handle fits in 64 AND is available → return it
 * 5. Throw if nothing found
 */
export async function resolveHandle(displayName: string, hexPubkey: string): Promise<string> {
	let base = toHandleBase(displayName) || `tasker_${npubDataSuffix(hexPubkey, 16)}`;

	// Pre-trim base so the shortest possible handle (base + "_" + 6 chars) fits in 64
	base = base.slice(0, 64 - 1 - 6).replace(/[._-]+$/, '');

	for (let suffixLen = 6; suffixLen <= 32; suffixLen++) {
		const handle = `${base}_${npubDataSuffix(hexPubkey, suffixLen)}`;
		if (handle.length > 64) continue; // suffix grew too long to fit, skip
		if (await authService.checkUsernameAvailability(handle)) return handle;
	}

	throw new Error('Could not find an available handle. Please try again.');
}
