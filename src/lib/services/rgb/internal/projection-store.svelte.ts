/**
 * RGB Projection — Internal Mutable Store (single writer)
 *
 * INTERNAL — do not import this module outside `src/lib/services/rgb/`.
 * `setRgbProjection` is only meant to be called by `command-queue.ts` (the
 * single writer to the WASM stash); `markRgbUnavailable` is the one other
 * narrow, purpose-built write path, used by `wallet-init.ts` to surface init
 * failures. Public consumers get the read-only `rgbProjection` re-export from
 * `../rgb-state.svelte.ts` instead — that file intentionally does not
 * re-export either writer.
 *
 * See docs/adr/0001-greenfield-rgb-wasm-subsystem.md
 * ("Single-writer is enforced by convention, not mechanically").
 */

import type { RgbStateProjection } from '../types';

const EMPTY_PROJECTION: RgbStateProjection = {
	version: 0,
	balances: [],
	seals: [],
	status: 'uninitialized'
};

let projection = $state<RgbStateProjection>(EMPTY_PROJECTION);

/** Read-only reactive view — re-exported (read-only) via `rgb-state.svelte.ts`. */
export const rgbProjection = $derived(projection);

/** Publishes a new immutable snapshot. Command-queue-only — see file header. */
export function setRgbProjection(next: RgbStateProjection): void {
	projection = next;
}

/**
 * Marks the projection unavailable without touching its `balances`/`seals` —
 * used when RGB command queue init fails so failure isn't swallowed silently.
 */
export function markRgbUnavailable(reason: string): void {
	projection = {
		...projection,
		status: 'unavailable',
		unavailableReason: reason
	};
}
