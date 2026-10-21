import { writable } from 'svelte/store';

const STORAGE_PREFIX = 'CapacitorStorage.';
const LOGIN_KIND_KEY = 'bittasker.wallet_login';
/** Access token used when the account server cannot sign the nsec in. It is not a JWT. */
export const LOCAL_NSEC_ACCESS_TOKEN = 'local-nsec';

let nsecLoginInProgress = false;

/** True while Login with Nostr nsec is running, before the account method is stored. */
export function suppressWebAuthnForNsec(active: boolean): void {
	nsecLoginInProgress = active;
}

export function isLocalNsecToken(token: string | null | undefined): boolean {
	return token === LOCAL_NSEC_ACCESS_TOKEN;
}

/** nsec login and nsec sessions must not call navigator.credentials. */
export function webAuthnBlocked(): boolean {
	return nsecLoginInProgress || walletUnlockRoute() === 'nsec';
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

function storedLoginMark(): string {
	if (typeof localStorage === 'undefined') return '';
	return (localStorage.getItem(LOGIN_KIND_KEY) || '').trim().toLowerCase();
}

function isPasskeyMethod(method: string): boolean {
	return (
		method === 'passkey' ||
		method === 'biometrics' ||
		method === 'biometric' ||
		method === 'webauthn'
	);
}

/**
 * How this signed-in account unlocks the wallet.
 * An nsec login never opens WebAuthn, even if a stale credential id is still stored.
 * A passkey account needs a saved credential id. Without one, the prompt cannot open,
 * so the wallet asks for the key instead.
 */
export function walletUnlockRoute(method = storedLoginMethod()): WalletUnlockRoute {
	const mark = storedLoginMark();
	if (mark === 'nsec' || method === 'nsec' || method === 'nostr' || method === 'key') return 'nsec';
	if (typeof localStorage === 'undefined') return 'passkey';
	const credential = storedPasskeyCredentialId();
	if (credential && (isPasskeyMethod(method) || mark === 'passkey' || !method)) return 'passkey';
	if (!credential && (storedAccountNpub() || method || mark)) return 'nsec';
	return 'passkey';
}

export const walletLoginKind = writable<WalletUnlockRoute>(
	typeof localStorage === 'undefined' ? 'passkey' : walletUnlockRoute()
);

export function refreshWalletLoginKind(): void {
	walletLoginKind.set(walletUnlockRoute());
}

/** Remember how this account unlocks. An nsec login drops any stale passkey id. */
export function rememberWalletLogin(method: string): void {
	const kind: WalletUnlockRoute =
		method === 'nsec' || method === 'nostr' || method === 'key' ? 'nsec' : 'passkey';
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(LOGIN_KIND_KEY, kind);
		if (kind === 'nsec') {
			localStorage.removeItem(`${STORAGE_PREFIX}webAuthnCredentialId`);
			localStorage.removeItem('webAuthnCredentialId');
		}
	}
	refreshWalletLoginKind();
}
