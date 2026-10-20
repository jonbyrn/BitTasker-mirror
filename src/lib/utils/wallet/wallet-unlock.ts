import { PASSKEY_UNLOCK_REQUIRED } from '$lib/utils/keys/passkey-policy';

/** True when this tab has no wallet seed, so the user must unlock with a passkey. */
export function walletNeedsPasskeyUnlock(mnemonic: string | null | undefined): boolean {
	return !mnemonic?.trim();
}

/** Initialization failed because the tab asked for a passkey instead of a network error. */
export function isPasskeyUnlockError(message: string | null | undefined): boolean {
	return message === PASSKEY_UNLOCK_REQUIRED;
}
