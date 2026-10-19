/**
 * One global queue for the browser RGB wasm instance.
 *
 * `@utexo/rgb-sdk-web` 1.0.0-beta.12 is overridden to `@utexo/rln-wasm` 0.17.0-beta.3.
 * Older builds panic with a Rust RefCell BorrowError when a wallet call overlaps
 * a Lightning node call, and the wasm instance stays dead until a full reload.
 */

export const WASM_CRASH_MESSAGE = 'Something went wrong. Tap to reopen.';

const PANIC_TEXT =
	/unreachable|already (mutably )?borrowed|RuntimeError|closure invoked recursively|after being dropped/i;

const SYNC_WALLET_METHODS = new Set(['isOnline', 'getLspConfig', 'getLightningNode']);
/**
 * createLsp stores `this` on UtexoLsp. That reference must be the proxy so later
 * connectPeer / listChannels / syncWallet calls stay on the queue.
 * Every other method must run with the raw wallet as `this`. beta.12 does
 * `this.requireNode().connectPeer()` / `.listChannels()`. If `this` is the proxy,
 * requireNode is queued and returns a Promise, and those methods are missing.
 */
const PROXY_RECEIVER_METHODS = new Set(['createLsp']);

let tail: Promise<unknown> = Promise.resolve();
let depth = 0;
let queued = 0;
let crashed = false;
/** True only during the synchronous start of the call that holds the queue. */
let syncNest = false;
let epoch = 0;
const crashListeners = new Set<() => void>();
let removePanicListener: (() => void) | null = null;
let crashTimer: ReturnType<typeof setTimeout> | null = null;

export function isWasmPanic(error: unknown): boolean {
	const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
	return PANIC_TEXT.test(text);
}

export function walletReloadRequired(message: string | null | undefined): boolean {
	if (!message) return false;
	return message === WASM_CRASH_MESSAGE || isWasmPanic(message) || /reload/i.test(message);
}

export function wasmBusy(): boolean {
	return depth > 0 || queued > 0;
}

export function wasmCrashed(): boolean {
	return crashed;
}

export function onWasmCrash(listener: () => void): () => void {
	crashListeners.add(listener);
	return () => crashListeners.delete(listener);
}

/** Allow a new engine after the dead instance has been dropped. */
export function clearWasmCrash(): void {
	crashed = false;
}

/** Drop a panicked turn so the next wallet can take the queue. */
export function releaseWasmQueue(): void {
	if (crashTimer !== null) {
		clearTimeout(crashTimer);
		crashTimer = null;
	}
	epoch += 1;
	tail = Promise.resolve();
	depth = 0;
	queued = 0;
	syncNest = false;
	clearWasmCrash();
}

export function markWasmCrashed(): void {
	if (crashed) return;
	crashed = true;
	for (const listener of crashListeners) {
		try {
			listener();
		} catch (error) {
			console.warn('[wasm-lock] crash listener failed', error);
		}
	}
}

function noticeCrash(): void {
	crashTimer = null;
	const listeners = [...crashListeners];
	for (const listener of listeners) {
		try {
			listener();
		} catch (error) {
			console.warn('[wasm-lock] crash listener failed', error);
		}
	}
}

/**
 * Mark the engine dead now, but restart it only after this stack unwinds.
 * The rln throw hook runs inside the panicked closure. Restarting there
 * calls wasm again after that closure was dropped.
 */
function notePanic(label: string, error: unknown): void {
	if (!isWasmPanic(error)) return;
	console.warn(
		`[wasm-lock] ${label} panicked`,
		error instanceof Error ? error.message : String(error)
	);
	if (crashed) return;
	crashed = true;
	if (crashTimer !== null) return;
	crashTimer = setTimeout(noticeCrash, 0);
}

/**
 * Run `fn` only after every earlier wasm call has settled.
 * A nested call may run during the synchronous start of the holder.
 * A call that arrives while the holder is awaiting waits until it finishes.
 */
export function withWasm<T>(label: string, fn: () => Promise<T>): Promise<T> {
	if (crashed) return Promise.reject(new Error(WASM_CRASH_MESSAGE));
	if (syncNest) {
		const ticket = epoch;
		try {
			return Promise.resolve(fn()).then(
				(value) => value,
				(error: unknown) => {
					if (ticket === epoch) notePanic(label, error);
					throw error;
				}
			);
		} catch (error) {
			if (ticket === epoch) notePanic(label, error);
			return Promise.reject(error);
		}
	}
	const ticket = epoch;
	queued += 1;
	const run = tail.then(async () => {
		if (ticket !== epoch) {
			queued = Math.max(0, queued - 1);
			throw new Error(WASM_CRASH_MESSAGE);
		}
		if (crashed) {
			queued -= 1;
			throw new Error(WASM_CRASH_MESSAGE);
		}
		depth += 1;
		syncNest = true;
		let pending: Promise<T>;
		try {
			pending = fn();
		} catch (error) {
			syncNest = false;
			depth -= 1;
			queued -= 1;
			if (ticket === epoch) notePanic(label, error);
			throw error;
		}
		syncNest = false;
		try {
			return await pending;
		} catch (error) {
			if (ticket === epoch) notePanic(label, error);
			throw error;
		} finally {
			if (ticket === epoch) {
				depth -= 1;
				queued -= 1;
			}
		}
	});
	tail = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

/** Queue every async method. `createLsp` keeps this proxy so LSP polls are queued too. */
export function lockedWallet<W extends object>(wallet: W): W {
	return new Proxy(wallet, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (typeof value !== 'function') return value;
			if (typeof prop === 'symbol' || SYNC_WALLET_METHODS.has(String(prop))) {
				return (value as (...args: unknown[]) => unknown).bind(target);
			}
			return (...args: unknown[]) =>
				withWasm(String(prop), async () =>
					Reflect.apply(
						value as (...a: unknown[]) => unknown,
						PROXY_RECEIVER_METHODS.has(String(prop)) ? receiver : target,
						args
					)
				);
		}
	});
}

/** Rust panics surface as window errors. Later calls must not touch the dead instance. */
export function installWasmPanicListener(): void {
	if (typeof window === 'undefined' || removePanicListener) return;
	const onError = (event: ErrorEvent): void => {
		notePanic('window', event.error ?? event.message);
	};
	const onRejection = (event: PromiseRejectionEvent): void => {
		notePanic('rejection', event.reason);
	};
	const onRlnThrow = (message: unknown): void => {
		notePanic('rln-throw', message instanceof Error ? message : new Error(String(message ?? '')));
	};
	const host = window as Window & { __bittaskerOnRlnThrow?: (message: unknown) => void };
	host.__bittaskerOnRlnThrow = onRlnThrow;
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	removePanicListener = () => {
		window.removeEventListener('error', onError);
		window.removeEventListener('unhandledrejection', onRejection);
		if (host.__bittaskerOnRlnThrow === onRlnThrow) delete host.__bittaskerOnRlnThrow;
		removePanicListener = null;
	};
}

/** Test isolation. Production startup never clears a crash; the page has to reload. */
export function resetWasmLockForTests(): void {
	removePanicListener?.();
	if (crashTimer !== null) {
		clearTimeout(crashTimer);
		crashTimer = null;
	}
	tail = Promise.resolve();
	depth = 0;
	queued = 0;
	syncNest = false;
	epoch = 0;
	crashed = false;
	crashListeners.clear();
}
