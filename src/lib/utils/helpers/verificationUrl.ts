/**
 * Base URL for Simple Proof file verification (blockchain timestamp proof).
 * @see https://verify.simpleproof.com
 */
const SIMPLEPROOF_VERIFY_BASE = 'https://verify.simpleproof.com/SP/P-00117/';

/** Matches a 64-char hex string (e.g. SHA-256 hash). */
const SHA256_HEX = /^[a-fA-F0-9]{64}$/;

/**
 * Returns an absolute URL suitable for use in href.
 * - If already http(s)://, returns as-is.
 * - If only a hash (64 hex chars), prepends Simple Proof verify base.
 * - Otherwise prepends https:// to avoid relative resolution (e.g. verify.simpleproof.com/...).
 */
export function ensureAbsoluteVerificationUrl(value: string | undefined | null): string {
	const url = (value ?? '').trim();
	if (!url) return '';

	if (url.startsWith('http://') || url.startsWith('https://')) {
		return url;
	}
	if (SHA256_HEX.test(url)) {
		return SIMPLEPROOF_VERIFY_BASE + url;
	}
	return 'https://' + url;
}
