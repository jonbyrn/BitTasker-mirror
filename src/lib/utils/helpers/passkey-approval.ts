import type { PublicKeyCredentialDescriptorJSON } from 'capacitor-webauthn';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { getBiometricData } from '$lib/utils/helpers/biometrics';
import { SignerLockedError, passkeyPromptSuppressed } from '$lib/utils/helpers/passkey-prompt';

export { passkeyPromptSuppressed };

/**
 * Step-up for moving funds, escrow, wallet export, and an explicit unlock.
 * Routine signing does not call this.
 */
export async function requirePasskeyApproval(signal?: AbortSignal): Promise<void> {
	if (passkeyPromptSuppressed()) return;
	const { value: credentialId } = await Preferences.get({
		key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
	});
	const allowCredentials: PublicKeyCredentialDescriptorJSON[] = credentialId
		? [{ id: credentialId, type: 'public-key' }]
		: [];
	const credentials = await getBiometricData(true, allowCredentials, signal);
	if (!credentials) throw new SignerLockedError();
}
