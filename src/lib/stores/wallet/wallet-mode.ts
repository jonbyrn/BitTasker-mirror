import { writable } from 'svelte/store';

const STORAGE_KEY = 'bittasker.wallet-advanced';

export const advancedWallet = writable(false);

/** UI preference only. Vitest's setup stub drops writes, so tests install a real map. */
function preferenceStore(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function loadAdvancedMode(): void {
	const stored = preferenceStore();
	if (!stored) return;
	try {
		advancedWallet.set(stored.getItem(STORAGE_KEY) === '1');
	} catch {
		advancedWallet.set(false);
	}
}

export function setAdvancedMode(on: boolean): void {
	advancedWallet.set(on);
	const stored = preferenceStore();
	if (!stored) return;
	try {
		stored.setItem(STORAGE_KEY, on ? '1' : '0');
	} catch {
		// Private mode can reject the write. The in-memory choice still applied.
	}
}
