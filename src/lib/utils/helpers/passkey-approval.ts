import type { PublicKeyCredentialDescriptorJSON } from 'capacitor-webauthn';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { getBiometricData, prefetchPasskeyChallenge } from '$lib/utils/helpers/biometrics';
import { walletUnlockRoute } from '$lib/utils/helpers/login-method';
import { SignerLockedError, passkeyPromptSuppressed } from '$lib/utils/helpers/passkey-prompt';

export { passkeyPromptSuppressed };

let cachedCredentialId = '';

/** Remember the passkey id so the next funding or escrow click can open WebAuthn immediately. */
export function rememberPasskeyCredentialId(id: string): void {
	if (id) cachedCredentialId = id;
}

/**
 * Step-up for moving funds, escrow, wallet export, and an explicit unlock.
 * Routine signing does not call this.
 * WebAuthn starts in this turn. Waiting on storage first hides the prompt.
 */
export function requirePasskeyApproval(signal?: AbortSignal): Promise<void> {
	if (passkeyPromptSuppressed()) return Promise.resolve();
	if (walletUnlockRoute() === 'nsec') return Promise.resolve();
	prefetchPasskeyChallenge();
	const allowCredentials: PublicKeyCredentialDescriptorJSON[] = cachedCredentialId
		? [{ id: cachedCredentialId, type: 'public-key' }]
		: [];
	const pending = getBiometricData(true, allowCredentials, signal);
	void Preferences.get({ key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID }).then(({ value }) => {
		if (value) cachedCredentialId = value;
	});
	return pending.then((credentials) => {
		if (!credentials) throw new SignerLockedError();
		if (credentials.credentialId) cachedCredentialId = credentials.credentialId;
	});
}
