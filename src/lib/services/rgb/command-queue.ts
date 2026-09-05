/**
 * RGB Single-Writer Command Queue
 *
 * Implements `RgbCommandQueue` (src/lib/services/rgb/types.ts). Serializes every
 * `commit`/`witness`/`spend`/`validateConsignment` call behind the previous one so
 * two transitions against the single-threaded WASM stash can never interleave —
 * extends the promise-chaining pattern already used by `ensureNdkReady()` in
 * src/lib/utils/swapAdapter.ts. See docs/adr/0001-greenfield-rgb-wasm-subsystem.md.
 *
 * The actual WASM/stash calls are delegated to an injected `RgbSealBackend` rather
 * than called directly here, so the queue's serialization/fail-closed guarantees
 * stay testable without a WASM dependency. `getBrowserRgbCommandQueue()` wires the
 * real `WasmRgbSealBackend` (src/lib/services/rgb/wasm-backend.ts) when given an
 * initialized wallet instance, falling back to the fail-closed
 * `UnimplementedRgbSealBackend` otherwise.
 */

import { browser } from '$app/environment';
import type { UTEXOWallet } from '@utexo/rgb-sdk-web';
import { WasmRgbSealBackend } from './wasm-backend';
import type { CommitCommandInput, RgbCommandQueue, RgbCommandResult, RgbSeal, SpendCommandInput, ValidateConsignmentInput, ValidateConsignmentResult, WitnessCommandInput } from './types';
/**
 * Backend contract the queue delegates actual stash mutation to. Implemented
 * against the real WASM SDK once its seal-lifecycle API is confirmed (see
 * docs/phase-0-roadmap.md item 1) — kept separate from the queue so the queue's
 * serialization/fail-closed guarantees are testable without a WASM dependency.
 */
export interface RgbSealBackend {
	commit(input: CommitCommandInput): Promise<RgbSeal>;
	witness(input: WitnessCommandInput): Promise<RgbSeal>;
	spend(input: SpendCommandInput): Promise<RgbSeal>;
	validateConsignment(input: ValidateConsignmentInput): Promise<ValidateConsignmentResult>;
}

/** Fail-closed default: no command executes until a real backend is wired. */
export class UnimplementedRgbSealBackend implements RgbSealBackend {
	async commit(): Promise<RgbSeal> {
		throw new Error('RgbSealBackend.commit is not yet implemented');
	}
	async witness(): Promise<RgbSeal> {
		throw new Error('RgbSealBackend.witness is not yet implemented');
	}
	async spend(): Promise<RgbSeal> {
		throw new Error('RgbSealBackend.spend is not yet implemented');
	}
	async validateConsignment(): Promise<ValidateConsignmentResult> {
		throw new Error('RgbSealBackend.validateConsignment is not yet implemented');
	}
}

class SerializedRgbCommandQueue implements RgbCommandQueue {
	/** Tail of the serialization chain — every command awaits this before running. */
	private tail: Promise<unknown> = Promise.resolve();

	constructor(private readonly backend: RgbSealBackend) {}

	/**
	 * Chains `task` onto the queue's tail. A rejected command resolves to a failed
	 * `RgbCommandResult` instead of throwing, so it can never poison the chain for
	 * commands queued after it.
	 */
	private enqueue<T>(task: () => Promise<T>): Promise<RgbCommandResult<T>> {
		const run = this.tail.then(async (): Promise<RgbCommandResult<T>> => {
			try {
				const value = await task();
				return { ok: true, value };
			} catch (err) {
				return { ok: false, error: err instanceof Error ? err.message : String(err) };
			}
		});
		// Swallow here so a failed command doesn't reject `this.tail` itself —
		// the failure is still surfaced to the caller via the resolved result above.
		this.tail = run.catch(() => undefined);
		return run;
	}

	commit(input: CommitCommandInput): Promise<RgbCommandResult<RgbSeal>> {
		return this.enqueue(() => this.backend.commit(input));
	}

	witness(input: WitnessCommandInput): Promise<RgbCommandResult<RgbSeal>> {
		return this.enqueue(() => this.backend.witness(input));
	}

	spend(input: SpendCommandInput): Promise<RgbCommandResult<RgbSeal>> {
		return this.enqueue(() => this.backend.spend(input));
	}

	validateConsignment(
		input: ValidateConsignmentInput
	): Promise<RgbCommandResult<ValidateConsignmentResult>> {
		return this.enqueue(() => this.backend.validateConsignment(input));
	}
}

/** Constructs a command queue against an explicit backend (used by tests). */
export function createRgbCommandQueue(backend: RgbSealBackend): RgbCommandQueue {
	return new SerializedRgbCommandQueue(backend);
}

let browserQueue: RgbCommandQueue | null = null;

/**
 * Lazily creates the browser-only command queue. `@utexo/rgb-sdk-web` is WASM and
 * must never be statically imported (breaks SSR) — this is the single guarded
 * entry point every caller in `src/lib/services/rgb/` should use instead of
 * importing the SDK directly.
 *
 * Pass the already-initialized `UTEXOWallet` instance (e.g. `state.utexoWallet`
 * from `wallet-init.ts`) to back the queue with the real `WasmRgbSealBackend`;
 * omit it to get the fail-closed `UnimplementedRgbSealBackend` default. Uses
 * `browser` from `$app/environment` (this repo's standard SSR guard — see
 * CLAUDE.md) rather than a raw `typeof window` check.
 */
export async function getBrowserRgbCommandQueue(
	walletInstance?: UTEXOWallet
): Promise<RgbCommandQueue> {
	if (!browser) {
		throw new Error('RGB command queue is browser-only');
	}
	if (browserQueue) {
		return browserQueue;
	}
	// Import kept for its WASM init side effect even when walletInstance is omitted
	// and the fail-closed placeholder backend below is used instead.
	await import('@utexo/rgb-sdk-web');
	const backend = walletInstance
		? new WasmRgbSealBackend(walletInstance)
		: new UnimplementedRgbSealBackend();
	browserQueue = createRgbCommandQueue(backend);
	return browserQueue;
}

