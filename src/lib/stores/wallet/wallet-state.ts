import type { UTEXOWallet } from '@utexo/rgb-sdk-web';
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { initialState, type WalletStateExtended } from './wallet-types';

export const walletStore = writable<WalletStateExtended>(structuredClone(initialState));

if (browser && import.meta.env.DEV) {
(window as unknown as { walletStore: { get: () => WalletStateExtended } }).walletStore = {
get: () => get(walletStore)
};
}

export const state = {
utexoWallet: null as UTEXOWallet | null,
loadTransactionsPromise: null as Promise<void> | null,
balanceRefreshTimer: null as ReturnType<typeof setTimeout> | null,
unsubscribeBlockWatch: null as (() => void) | null,
expectingInboundUntil: 0,
loadAssetsLock: false
};

export function isRgbWalletReady(): boolean {
return state.utexoWallet !== null;
}

export async function fetchWithRetry<T>(
fetchFn: () => Promise<T>,
maxRetries: number = 3
): Promise<T | null> {
for (let i = 0; i < maxRetries; i++) {
try {
return await fetchFn();
} catch (error) {
if (i === maxRetries - 1) {
console.error('[WALLET-STORE] All retries failed:', error);
return null;
}
await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, i)));
}
}
return null;
}

export function clearRefreshTimers(): void {
if (state.balanceRefreshTimer) {
clearTimeout(state.balanceRefreshTimer);
state.balanceRefreshTimer = null;
}
}
