import { browser } from '$app/environment';
import { writable } from 'svelte/store';

const STORAGE_KEY = 'bittasker.wallet-advanced';

export const advancedWallet = writable(false);

export function loadAdvancedMode(): void {
	if (!browser) return;
	advancedWallet.set(localStorage.getItem(STORAGE_KEY) === '1');
}

export function setAdvancedMode(on: boolean): void {
	advancedWallet.set(on);
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
}
