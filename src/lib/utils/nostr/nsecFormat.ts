import { nip19 } from 'nostr-tools';

/** NIP-19 nsec bech32 strings are 63 characters: "nsec1" plus 58 data characters. */
export const NSEC_BECH32_LENGTH = 63;

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

export const NSEC_INVALID_MESSAGE_KEY = 'login.errors.invalid_or_incomplete_nsec';
export const NSEC_SIGN_IN_FAILED_MESSAGE_KEY = 'login.errors.nsec_sign_in_failed';

/**
 * A complete nsec is the prefix nsec1, bech32 data, and a 63-character checksummed string.
 * Shorter or mistyped keys are rejected before any login request.
 */
export function isCompleteNsec(value: string | null | undefined): boolean {
	if (typeof value !== 'string') return false;
	const nsec = value.trim();
	if (nsec.length !== NSEC_BECH32_LENGTH || !nsec.startsWith('nsec1')) return false;
	const data = nsec.slice('nsec1'.length);
	for (const char of data) {
		if (!BECH32_CHARSET.includes(char)) return false;
	}
	try {
		const decoded = nip19.decode(nsec);
		return (
			decoded.type === 'nsec' && decoded.data instanceof Uint8Array && decoded.data.length === 32
		);
	} catch {
		return false;
	}
}

/**
 * Non-2xx from the encrypted-data login call should stop the spinner with a translated error.
 * A valid nsec and a missing status (the request has not been sent) may continue.
 */
export function nsecLoginBlockReason(
	nsec: string,
	httpStatus?: number | null
): typeof NSEC_INVALID_MESSAGE_KEY | typeof NSEC_SIGN_IN_FAILED_MESSAGE_KEY | null {
	if (!isCompleteNsec(nsec)) return NSEC_INVALID_MESSAGE_KEY;
	if (httpStatus == null) return null;
	if (httpStatus < 200 || httpStatus >= 300) return NSEC_SIGN_IN_FAILED_MESSAGE_KEY;
	return null;
}
