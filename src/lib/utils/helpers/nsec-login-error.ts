/** Map a raw nsec-login failure onto translated copy. The passkey modal stays closed. */
export function nsecLoginFailure(
	message: string
): { textKey: string; passkeyModal: boolean } | null {
	const lower = message.toLowerCase();
	const raw =
		lower.includes('webauthn verification fields') ||
		lower.includes('webauthn') ||
		lower.includes('wrong kind') ||
		lower.includes('invalid event kind') ||
		lower.includes('invalid signature') ||
		lower.includes('invalid or expired challenge') ||
		lower.includes('challenge mismatch') ||
		lower.includes('challenge tag missing') ||
		lower.includes('unauthorized access');
	if (!raw) return null;
	return { textKey: 'login.errors.nsec_sign_in', passkeyModal: false };
}

/** The account server failed or never answered. The key itself can still open a device session. */
export function isNsecServerOutage(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes('internal server error') ||
		lower.includes('timeout') ||
		lower.includes('network error') ||
		lower.includes('failed to fetch') ||
		lower.includes('econnaborted')
	);
}
