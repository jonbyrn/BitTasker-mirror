import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';

/** Caches that used to be one slot for every account on this browser. */
export const WALLET_CACHE_BASES = [
	'bittasker.usdt-sends',
	'bittasker.usdt-receives',
	'bittasker.usdt-spent-proof',
	'bittasker.cancelled-receives',
	'bittasker.contract-paid',
	'bittasker.escrow-resume'
] as const;

/** Old snapshot row written when the pubkey was not known yet. */
export const SHARED_SNAPSHOT_KEY = 'active';

/** Pubkey for the signed-in account. A missing pubkey must not share a slot. */
export function walletOwnerId(): string | null {
	const state = get(appStore);
	const raw = state.nostrKeys.npub || state.biometricData?.npub || '';
	const id = raw.trim().toLowerCase();
	return id.length > 0 ? id : null;
}

export function walletCacheKey(base: string, owner: string | null = walletOwnerId()): string | null {
	if (!owner) return null;
	return `${base}.${owner}`;
}

function storage(): Storage | null {
	return typeof localStorage === 'undefined' ? null : localStorage;
}

/** Drop the unscoped copy so the next account cannot read it. */
function dropShared(base: string): void {
	storage()?.removeItem(base);
}

export function readWalletCache(base: string, owner: string | null = walletOwnerId()): string | null {
	const store = storage();
	if (!store) return null;
	dropShared(base);
	const key = walletCacheKey(base, owner);
	if (!key) return null;
	return store.getItem(key);
}

export function writeWalletCache(
	base: string,
	value: string | null,
	owner: string | null = walletOwnerId()
): void {
	const store = storage();
	if (!store) return;
	dropShared(base);
	const key = walletCacheKey(base, owner);
	if (!key) return;
	if (value === null) store.removeItem(key);
	else store.setItem(key, value);
}

/** Remove this account's wallet cache and every old unscoped copy. */
export function clearWalletAccountCache(owner: string | null): void {
	const store = storage();
	if (!store) return;
	for (const base of WALLET_CACHE_BASES) {
		dropShared(base);
		if (owner) store.removeItem(`${base}.${owner}`);
	}
	for (let index = store.length - 1; index >= 0; index -= 1) {
		const key = store.key(index);
		if (key?.startsWith('rgb-escrow-invoice:')) store.removeItem(key);
	}
}
