/**
 * Chain transaction sort hints — user-activity order vs block confirmation time.
 * Persisted via Capacitor Preferences (mobile-safe).
 */

import { browser } from '$app/environment';
import { Preferences } from '@capacitor/preferences';
import type { BoltzSwapData, ChainSwapData, SubmarineSwapData } from '@bittasker/wallet-core';
import { StorageKeys } from '$lib/utils/constants/storage';
import { isSwapCompleted } from '$lib/utils/wallet/swapStatusMap';

const EVM_TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export type SwapSortEntry = {
	swapType: 'submarine' | 'reverse' | 'chain';
	swap: BoltzSwapData | ChainSwapData | SubmarineSwapData;
};

/** Normalize SDK timestamps (seconds, ms, or ISO) to ISO strings. */
export function toSortIso(value: string | number | undefined): string | null {
	if (value == null) return null;
	const ms = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);
	if (Number.isNaN(ms)) return null;
	return new Date(ms).toISOString();
}

/** Build hash → activity-time hints from all Nostr swaps (including completed). */
export function buildChainSortHintsFromSwaps(entries: SwapSortEntry[]): Map<string, string> {
	const hints = new Map<string, string>();

	for (const { swapType, swap } of entries) {
		if (swapType === 'submarine') {
			const hash = swap.lockupTxHash;
			const iso = toSortIso(swap.createdAt);
			if (hash && iso && EVM_TX_HASH.test(hash)) {
				hints.set(hash.toLowerCase(), iso);
			}
			continue;
		}

		if (!isSwapCompleted(swap.status)) continue;

		const claimHash = (swap as BoltzSwapData | ChainSwapData).claimTxHash;
		const iso = toSortIso(swap.updatedAt) ?? toSortIso(swap.createdAt);
		if (claimHash && iso && EVM_TX_HASH.test(claimHash)) {
			hints.set(claimHash.toLowerCase(), iso);
		}
	}

	return hints;
}

export function mergeChainSortHints(
	target: Map<string, string>,
	incoming: ReadonlyMap<string, string>
): void {
	for (const [hash, iso] of incoming) {
		const key = hash.toLowerCase();
		const existing = target.get(key);
		if (!existing || new Date(iso).getTime() > new Date(existing).getTime()) {
			target.set(key, iso);
		}
	}
}

export async function loadPersistedChainSortHints(): Promise<Map<string, string>> {
	const hints = new Map<string, string>();
	if (!browser) return hints;

	try {
		const { value } = await Preferences.get({ key: StorageKeys.WALLET_CHAIN_SORT_HINTS });
		if (!value) return hints;
		const stored = JSON.parse(value) as Record<string, string>;
		for (const [hash, iso] of Object.entries(stored)) {
			hints.set(hash.toLowerCase(), iso);
		}
	} catch {
		// ignore corrupt storage
	}

	return hints;
}

export async function hydrateChainSortHints(target: Map<string, string>): Promise<void> {
	const persisted = await loadPersistedChainSortHints();
	mergeChainSortHints(target, persisted);
}

export async function persistChainSortHint(hash: string, iso: string): Promise<void> {
	if (!browser) return;

	try {
		const persisted = await loadPersistedChainSortHints();
		persisted.set(hash.toLowerCase(), iso);
		await persistChainSortHintsMap(persisted);
	} catch {
		// ignore quota / native errors
	}
}

export async function persistChainSortHintsMap(hints: ReadonlyMap<string, string>): Promise<void> {
	if (!browser) return;
	try {
		await Preferences.set({
			key: StorageKeys.WALLET_CHAIN_SORT_HINTS,
			value: JSON.stringify(Object.fromEntries(hints))
		});
	} catch {
		// ignore
	}
}

export async function clearPersistedChainSortHints(): Promise<void> {
	if (!browser) return;
	try {
		await Preferences.remove({ key: StorageKeys.WALLET_CHAIN_SORT_HINTS });
	} catch {
		// ignore
	}
}
