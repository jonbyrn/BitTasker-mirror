/**
 * Read-only combined view: legacy wallet state + RGB projection.
 *
 * This is the "dedicated reconciliation seam" required by
 * docs/adr/0001-greenfield-rgb-wasm-subsystem.md — `walletStore` and the RGB
 * module never write into a shared object. This file only reads from both
 * and derives a combined view; it never calls `walletStore.set/update` and
 * never calls `setRgbProjection`. `WalletStateExtended` itself is untouched.
 *
 * `$storeName` auto-subscription (`$walletStore`) only works inside actual
 * `.svelte` component instances, not in `.svelte.ts` module scope — using it
 * here throws at runtime. `get(walletStore)` would compile, but it's a
 * one-time, non-reactive read: baking it into a module-level `$derived.by`
 * would make `walletWithRgb` stale on every subsequent wallet-store update
 * except when `rgbProjection` happens to also change. So this is a plain
 * function instead: call it from a `.svelte` file as
 * `$derived(buildWalletWithRgb($walletStore))`, where `$walletStore`'s
 * auto-subscription (supported there) drives reactivity, and the
 * `rgbProjection` read inside still participates in that same `$derived`
 * via Svelte 5's fine-grained tracking.
 */

import { rgbProjection } from '$lib/services/rgb/rgb-state.svelte';
import type { WalletStateExtended } from './wallet-types';
import type { RgbStateProjection } from '$lib/services/rgb/types';

export type WalletWithRgbProjection = Omit<WalletStateExtended, 'rgb'> & {
	rgb: RgbStateProjection;
};

/** Combines a wallet-state snapshot with the current RGB projection. Call from a
 * `.svelte` component's `$derived(buildWalletWithRgb($walletStore))`. */
export function buildWalletWithRgb(wallet: WalletStateExtended): WalletWithRgbProjection {
	return {
		...wallet,
		rgb: rgbProjection
	};
}
