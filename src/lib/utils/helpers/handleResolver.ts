import { nip19 } from 'nostr-tools';
import { normalizeDisplayNameToNip05HandleBase } from './handleNormalizer';

const NPUB_PREFIX = 'npub1';
const BECH32_CHECKSUM_LEN = 6;
const MAX_HANDLE_LENGTH = 64;
const BASE_MAX_LENGTH = 50;
const FALLBACK_PREFIX = 'tasker_';
const FALLBACK_NPUB_SUFFIX_LEN = 16;
const INITIAL_SUFFIX_LEN = 6;
const MAX_SUFFIX_LEN = 32;

/**
 * Get the Bech32 data part of an npub (payload between "npub1" and the 6-char checksum).
 * Used to derive unique handle suffixes from the public key.
 *
 * @param hexPubkey - Public key in hex (e.g. from getPublicKey)
 * @returns Bech32 data part string, or empty if encoding fails
 */
export function getNpubBech32DataPart(hexPubkey: string): string {
	try {
		const npub = nip19.npubEncode(hexPubkey);
		if (!npub.startsWith(NPUB_PREFIX) || npub.length <= NPUB_PREFIX.length + BECH32_CHECKSUM_LEN) {
			return '';
		}
		return npub.slice(NPUB_PREFIX.length, -BECH32_CHECKSUM_LEN);
	} catch {
		return '';
	}
}

/**
 * Derive a unique handle from display name and public key (NIP-05 + email compatible).
 * Base from display name (strict a-z0-9-_.); if empty, use tasker_ + last 16 of npub data part.
 * Suffix = last 6 (then 7, 8, …) of npub Bech32 data part until checkAvailable(handle) is true.
 *
 * @param displayName - Step 1 display name
 * @param hexPubkey - Nostr public key in hex
 * @param checkAvailable - Returns true if handle is available (e.g. authService.checkUsernameAvailability)
 * @returns Resolved handle (max 64 chars)
 */
export async function resolveHandle(
	displayName: string,
	hexPubkey: string,
	checkAvailable: (handle: string) => Promise<boolean>
): Promise<string> {
	const dataPart = getNpubBech32DataPart(hexPubkey);
	if (!dataPart) {
		throw new Error('Invalid public key for handle derivation');
	}

	let base = normalizeDisplayNameToNip05HandleBase(displayName, BASE_MAX_LENGTH);
	if (base.length === 0) {
		base = FALLBACK_PREFIX + dataPart.slice(-FALLBACK_NPUB_SUFFIX_LEN);
	}

	// Ensure base + "_" + suffix fits in 64
	const maxBaseLen = Math.min(base.length, MAX_HANDLE_LENGTH - 2 - INITIAL_SUFFIX_LEN);
	base = base.slice(0, maxBaseLen);
	base = base.replace(/[.-]+$/, '');

	for (let suffixLen = INITIAL_SUFFIX_LEN; suffixLen <= MAX_SUFFIX_LEN; suffixLen++) {
		const suffix = dataPart.slice(-suffixLen);
		const handle = base + '_' + suffix;
		if (handle.length > MAX_HANDLE_LENGTH) continue;
		const available = await checkAvailable(handle);
		if (available) return handle;
	}

	throw new Error('Could not find an available handle. Please try again.');
}
