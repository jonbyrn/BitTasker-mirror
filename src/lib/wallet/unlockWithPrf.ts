/**
 * Input mixed into the login WebAuthn PRF eval. Hotfix 2 must use this same
 * salt when it verifies the output.
 */
export const LOGIN_PRF_SALT = 'bittasker.wallet.unlock';

export function loginPrfInput(): ArrayBuffer {
	return new TextEncoder().encode(LOGIN_PRF_SALT).buffer;
}

/**
 * Hotfix 2's wallet hook is not on sandbox. This seam is the only call site:
 * passkey login asks for PRF, then calls unlockWithPrf(prfOutput, credentialId).
 * Returning false leaves the wallet on tap-to-unlock. Never asks for an nsec.
 */
export async function unlockWithPrf(
	prfOutput: ArrayBuffer | null | undefined,
	credentialId: string
): Promise<boolean> {
	if (!prfOutput || prfOutput.byteLength === 0 || !credentialId) return false;
	return false;
}
