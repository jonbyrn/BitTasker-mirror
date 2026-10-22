import { nip19 } from 'nostr-tools';

/** NIP-19 nsec bech32 strings are 63 characters: "nsec1" plus 58 data characters. */
export const NSEC_BECH32_LENGTH = 63;

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

export const NSEC_INVALID_MESSAGE_KEY = 'login.errors.invalid_or_incomplete_nsec';
export const NSEC_NO_ACCOUNT_MESSAGE_KEY = 'login.errors.nsec_no_account';
export const NSEC_SIGN_IN_FAILED_MESSAGE_KEY = 'login.errors.nsec_sign_in_failed';

/** Body the API returns when a well-formed nsec has no BitTasker account. */
export const UNREGISTERED_NSEC_API_MESSAGE = 'User not found with this public key';

export type NsecLoginBlock = {
	key:
		| typeof NSEC_INVALID_MESSAGE_KEY
		| typeof NSEC_NO_ACCOUNT_MESSAGE_KEY
		| typeof NSEC_SIGN_IN_FAILED_MESSAGE_KEY;
	signup: boolean;
};

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

function textOf(value: unknown): string {
	if (typeof value === 'string') return value;
	if (!value || typeof value !== 'object') return '';
	const record = value as Record<string, unknown>;
	return [record.message, record.error, record.detail, record.title]
		.map(textOf)
		.filter(Boolean)
		.join('\n');
}

/** Message text from an ApiError or a similar thrown response. */
export function nsecApiErrorText(error: unknown): string {
	if (!error || typeof error !== 'object') return '';
	const record = error as { message?: unknown; data?: unknown };
	return [textOf(record.message), textOf(record.data)].filter(Boolean).join('\n');
}

export function isUnregisteredNsecMessage(message: string | null | undefined): boolean {
	return (message ?? '').toLowerCase().includes(UNREGISTERED_NSEC_API_MESSAGE.toLowerCase());
}

/**
 * A bad nsec never leaves the device. A 400 whose body says the public key is
 * unknown is an unregistered account. Every other non-2xx is a generic failure.
 * A valid nsec and a missing status (the request has not been sent) may continue.
 */
export function nsecLoginBlockReason(
	nsec: string,
	httpStatus?: number | null,
	apiMessage?: string | null
): NsecLoginBlock | null {
	if (!isCompleteNsec(nsec)) return { key: NSEC_INVALID_MESSAGE_KEY, signup: false };
	if (httpStatus == null) return null;
	if (httpStatus >= 200 && httpStatus < 300) return null;
	if (httpStatus === 400 && isUnregisteredNsecMessage(apiMessage)) {
		return { key: NSEC_NO_ACCOUNT_MESSAGE_KEY, signup: true };
	}
	return { key: NSEC_SIGN_IN_FAILED_MESSAGE_KEY, signup: false };
}
