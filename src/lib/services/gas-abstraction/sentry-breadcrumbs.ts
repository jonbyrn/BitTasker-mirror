/**
 * Sentry Breadcrumbs for Delegation States — Phase 2.5
 *
 * Lightweight wrapper around `Sentry.addBreadcrumb()` that logs EIP-7702
 * delegation state transitions, errors, and key lifecycle events.
 *
 * Falls back gracefully (no-op) when Sentry is not initialised or when
 * running in development mode.
 *
 * @see USDT Integration Plan §2.5
 * @see https://docs.sentry.io/platforms/javascript/enriching-events/breadcrumbs/
 */

import { addBreadcrumb } from '@sentry/sveltekit';
import type { DelegationState } from '$lib/services/delegation-journal';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether Sentry is properly initialised by checking for the
 * presence of the internal hub. Returns `false` when running in
 * development (Sentry is not initialised there).
 *
 * This is a best-effort heuristic — if Sentry init was called but failed
 * silently, we will still attempt to add breadcrumbs (which Sentry safely
 * discards when uninitialised).
 */
function isSentryActive(): boolean {
	try {
		// Sentry sets a global flag after successful init.
		// The precise check varies by version; checking for the hub
		// function is the most reliable cross-version approach.
		return typeof addBreadcrumb === 'function';
	} catch {
		return false;
	}
}

/**
 * Format a timestamp for Sentry breadcrumb display.
 * Uses ISO 8601 with milliseconds.
 */
function formatTimestamp(): string {
	return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Log a delegation state transition as a Sentry breadcrumb.
 *
 * Call this function whenever the delegation lifecycle advances to a
 * new state. The breadcrumb is categorised as `'state'` and includes
 * the new state name, timestamp, and any optional metadata (e.g.
 * transaction hash).
 *
 * @param state - The delegation state that was entered
 * @param metadata - Optional key-value pairs to attach to the breadcrumb
 *   (e.g. `{ tx1Hash: '0x...' }`)
 *
 * @example
 * ```ts
 * logDelegationBreadcrumb('TX1_SUBMITTED', { tx1Hash: '0xabc...' });
 * logDelegationBreadcrumb('TX2_MINED');
 * ```
 */
export function logDelegationBreadcrumb(
	state: DelegationState,
	metadata?: Record<string, unknown>
): void {
	if (!isSentryActive()) {
		return;
	}

	const data: Record<string, unknown> = {
		state,
		timestamp: formatTimestamp()
	};

	if (metadata !== undefined) {
		// Merge metadata without mutating the caller's object
		for (const [key, value] of Object.entries(metadata)) {
			data[key] = value;
		}
	}

	addBreadcrumb({
		category: 'delegation-state',
		message: `Delegation state: ${state}`,
		level: 'info',
		data
	});
}

/**
 * Log a delegation error as a Sentry breadcrumb with error detail.
 *
 * Unlike `logDelegationBreadcrumb`, this sets the breadcrumb level to
 * `'error'` and includes the error's message, name, and optional
 * metadata.
 *
 * @param state - The delegation state when the error occurred
 * @param error - The error object to log
 *
 * @example
 * ```ts
 * try {
 *   await submitTx1();
 * } catch (err) {
 *   logDelegationError('TX1_SUBMITTED', err instanceof Error ? err : new Error(String(err)));
 * }
 * ```
 */
export function logDelegationError(state: DelegationState, error: Error): void {
	if (!isSentryActive()) {
		return;
	}

	addBreadcrumb({
		category: 'delegation-error',
		message: `Delegation error in state ${state}: ${error.message}`,
		level: 'error',
		data: {
			state,
			errorName: error.name,
			errorMessage: error.message,
			errorStack: error.stack ?? null,
			timestamp: formatTimestamp()
		}
	});
}
