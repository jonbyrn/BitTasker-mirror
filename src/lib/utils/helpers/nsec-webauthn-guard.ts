/** Block navigator.credentials while an nsec login is in flight or the session is nsec. */

let nsecLoginInProgress = false;

export function suppressWebAuthnForNsec(active: boolean): void {
	nsecLoginInProgress = active;
}

function readStorage(key: string): string {
	if (typeof localStorage === 'undefined') return '';
	return (localStorage.getItem(`CapacitorStorage.${key}`) || localStorage.getItem(key) || '')
		.trim()
		.toLowerCase();
}

/** True for an nsec login in progress and for a stored nsec session. */
export function isNsecSession(): boolean {
	if (nsecLoginInProgress) return true;
	const method = readStorage('auth_method');
	const mark =
		typeof localStorage === 'undefined'
			? ''
			: (localStorage.getItem('bittasker.wallet_login') || '').trim().toLowerCase();
	return method === 'nsec' || method === 'nostr' || method === 'key' || mark === 'nsec';
}

export class NsecWebAuthnBlocked extends Error {
	constructor() {
		super('Enter your nsec to unlock this wallet');
		this.name = 'NsecWebAuthnBlocked';
	}
}

/** Throw before any navigator.credentials.create or get. */
export function assertWebAuthnAllowed(): void {
	if (isNsecSession()) throw new NsecWebAuthnBlocked();
}
