import { writable } from 'svelte/store';

const STORAGE_PREFIX = 'CapacitorStorage.';
const LOGIN_KIND_KEY = 'bittasker.wallet_login';
/** Access token used when the account server cannot sign the nsec in. It is not a JWT. */
export const LOCAL_NSEC_ACCESS_TOKEN = 'local-nsec';

/** Older callers set this during nsec login. It does not block a passkey ceremony. */
export function suppressWebAuthnForNsec(_active: boolean): void {}

export function isLocalNsecToken(token: string | null | undefined): boolean {
	return token === LOCAL_NSEC_ACCESS_TOKEN;
}

/** Passkey create and login are never blocked by an nsec mark. */
export function webAuthnBlocked(): boolean {
	return false;
}

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
 * The RGB wallet unlocks with a passkey. A stored nsec, nostr, or key mark must not
 * ask the user to type a private key.
 */
export function walletUnlockRoute(_method = storedLoginMethod()): WalletUnlockRoute {
	return 'passkey';
}

export const walletLoginKind = writable<WalletUnlockRoute>(
	typeof localStorage === 'undefined' ? 'passkey' : walletUnlockRoute()
);

export function refreshWalletLoginKind(): void {
	walletLoginKind.set(walletUnlockRoute());
}

/** Remember a passkey unlock. An nsec login must not drop the passkey credential id. */
export function rememberWalletLogin(_method: string): void {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(LOGIN_KIND_KEY, 'passkey');
	}
	refreshWalletLoginKind();
}
