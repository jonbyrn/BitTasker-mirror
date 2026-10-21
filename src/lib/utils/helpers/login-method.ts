const STORAGE_PREFIX = 'CapacitorStorage.';

function readStorage(key: string): string {
	if (typeof localStorage === 'undefined') return '';
	return (
		localStorage.getItem(`${STORAGE_PREFIX}${key}`) ||
		localStorage.getItem(key) ||
		''
	).trim();
}

/** Login method written by Capacitor Preferences, or the bare key some sessions still use. */
export function storedLoginMethod(): string {
	return readStorage('auth_method').toLowerCase();
}

export function storedAccountNpub(): string {
	return readStorage('npub');
}

export function storedPasskeyCredentialId(): string {
	return readStorage('webAuthnCredentialId');
}

export type WalletUnlockRoute = 'nsec' | 'passkey';

/**
 * How this signed-in account unlocks the wallet.
 * `nsec` and `nostr` are the same key login. An older nsec login never wrote
 * the method (it skipped the redirect), so a stored public key with no passkey
 * credential is also a key login. Passkey accounts keep WebAuthn.
 */
export function walletUnlockRoute(method = storedLoginMethod()): WalletUnlockRoute {
	if (method === 'nsec' || method === 'nostr') return 'nsec';
	if (method) return 'passkey';
	if (typeof localStorage === 'undefined') return 'passkey';
	if (storedPasskeyCredentialId()) return 'passkey';
	if (storedAccountNpub()) return 'nsec';
	return 'passkey';
}
