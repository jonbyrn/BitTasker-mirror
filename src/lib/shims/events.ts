/**
 * Browser-safe `events` shim.
 *
 * The npm `events` package is CJS-only (`main: events.js`, no ESM entry). When
 * bundled through Rollup's CJS interop, its `EventEmitter` export is attached to
 * the interop namespace lazily — AFTER modules like NDK's `NDKRelay` evaluate
 * `class NDKRelay extends EventEmitter`. That eval-order gap produces
 * `TypeError: Class extends value undefined` in production chunks.
 *
 * This shim provides a self-contained, dependency-free `EventEmitter` exported
 * as a static named ESM binding, so it is defined at module-init time — before
 * any subclass definition runs. No CJS interop is involved.
 */

type Listener = (...args: unknown[]) => void;

export class EventEmitter {
	private _events: Map<string | symbol, Listener[]> = new Map();

	on(event: string | symbol, listener: Listener): this {
		const listeners = this._events.get(event) ?? [];
		listeners.push(listener);
		this._events.set(event, listeners);
		return this;
	}

	addListener(event: string | symbol, listener: Listener): this {
		return this.on(event, listener);
	}

	once(event: string | symbol, listener: Listener): this {
		const wrapper: Listener = (...args) => {
			this.off(event, wrapper);
			listener(...args);
		};
		return this.on(event, wrapper);
	}

	off(event: string | symbol, listener: Listener): this {
		const listeners = this._events.get(event);
		if (listeners) {
			const index = listeners.indexOf(listener);
			if (index !== -1) listeners.splice(index, 1);
			if (listeners.length === 0) this._events.delete(event);
		}
		return this;
	}

	removeListener(event: string | symbol, listener: Listener): this {
		return this.off(event, listener);
	}

	removeAllListeners(event?: string | symbol): this {
		if (event === undefined) {
			this._events.clear();
		} else {
			this._events.delete(event);
		}
		return this;
	}

	emit(event: string | symbol, ...args: unknown[]): boolean {
		const listeners = this._events.get(event);
		if (!listeners || listeners.length === 0) return false;
		for (const listener of [...listeners]) {
			listener(...args);
		}
		return true;
	}

	listeners(event: string | symbol): Listener[] {
		return [...(this._events.get(event) ?? [])];
	}

	listenerCount(event: string | symbol): number {
		return this._events.get(event)?.length ?? 0;
	}
}

export default EventEmitter;
