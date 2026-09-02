/**
 * RGB Read-Only State Projection (single writer) + Command Queue Access
 *
 * The only place inside `src/lib/services/rgb/` allowed to hold the RGB
 * module's reactive snapshot. Nothing outside this file may mutate it —
 * the module-scoped `$state` below is never exported; only a read-only
 * `$derived` view is. Future command-queue wiring publishes new snapshots
 * by calling `setRgbProjection` from within this module only.
 *
 * See docs/adr/0001-greenfield-rgb-wasm-subsystem.md
 * ("Read-only Svelte 5 UI projections").
 */

import type { RgbCommandQueue } from './types';
import type { RgbStateProjection } from './types';
import { getBrowserRgbCommandQueue } from './command-queue';

const EMPTY_PROJECTION: RgbStateProjection = {
	version: 0,
	balances: [],
	seals: []
};

let projection = $state<RgbStateProjection>(EMPTY_PROJECTION);

/** Read-only reactive view — consumers use this via `$derived`, never the setter below. */
export const rgbProjection = $derived(projection);

/**
 * Publishes a new immutable snapshot. Not exported outside `src/lib/services/rgb/` —
 * only the command queue (the single writer to the WASM stash) may call this once
 * it emits real snapshots.
 */
export function setRgbProjection(next: RgbStateProjection): void {
	projection = next;
}

/**
 * UI entry point for issuing RGB commands. Deliberately kept separate from
 * `rgbProjection`/`walletWithRgb` rather than folded into either — those are
 * read-only views, and mixing an imperative command interface into a
 * read-only projection would blur the read/write boundary this module exists
 * to enforce. Returns the singleton queue created by `wallet-init.ts` once
 * the RGB wallet has initialized; rejects if called before that (or on SSR).
 */
export function getRgbCommandQueue(): Promise<RgbCommandQueue> {
	return getBrowserRgbCommandQueue();
}
