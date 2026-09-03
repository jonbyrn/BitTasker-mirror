/**
 * RGB Public Read-Only Surface + Command Queue Access
 *
 * Re-exports the read-only projection from `./internal/projection-store.svelte.ts`
 * without its mutable setter — `setRgbProjection` is command-queue-only and is
 * never re-exported from here. `markRgbUnavailable` is the one narrow write
 * path exposed publicly, for callers like `wallet-init.ts` that need to
 * surface an init failure without gaining general write access.
 *
 * See docs/adr/0001-greenfield-rgb-wasm-subsystem.md
 * ("Single-writer is enforced by convention, not mechanically").
 */

import type { RgbCommandQueue } from './types';
import { getBrowserRgbCommandQueue } from './command-queue';
import { rgbProjection, markRgbUnavailable } from './internal/projection-store.svelte';

export { rgbProjection, markRgbUnavailable };

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
