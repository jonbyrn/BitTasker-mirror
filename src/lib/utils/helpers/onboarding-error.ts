const JARGON =
	/nostr|relay|rel[eé]|credential|credencial|authenticator|autenticador|webauthn|buffer|websocket|nip-?19|secp|\bnsec\b|\bnpub\b|\bhandle\b/i;

export type ProfilePublishErrorKind = 'verify_timeout' | 'relay_rejected' | 'failed';

/** Known profile-publish failures. Anything else uses the plain fallback. */
export function profilePublishErrorKind(err: unknown): ProfilePublishErrorKind {
	const message = err instanceof Error ? err.message : '';
	if (message === 'PROFILE_METADATA_VERIFY_TIMEOUT') return 'verify_timeout';
	if (message === 'PROFILE_METADATA_PUBLISH_REJECTED') return 'relay_rejected';
	return 'failed';
}

/**
 * Keep a message that is already plain. Protocol and implementation text
 * is replaced with the translated fallback.
 */
export function userFacingOnboardingError(message: string, fallback: string): string {
	const text = message.trim();
	if (!text || JARGON.test(text)) return fallback;
	return text;
}
