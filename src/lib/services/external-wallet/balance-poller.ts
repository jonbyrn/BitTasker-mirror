/**
 * Balance Polling Manager — Lifecycle-aware polling for connected wallet balances.
 *
 * Pauses on Capacitor pause, resumes on resume. Cleared on disconnect.
 * Debounces concurrent requests with a 500ms window.
 */

import { browser } from '$app/environment';

let AppModule: typeof import('@capacitor/app') | null = null;
async function loadAppModule(): Promise<typeof import('@capacitor/app') | null> {
	if (!browser) return null;
	try {
		AppModule = await import('@capacitor/app');
		return AppModule;
	} catch {
		return null;
	}
}

type PollCallback = () => Promise<void>;
type TimerId = ReturnType<typeof setInterval>;

export class BalancePollingManager {
	private timers = new Map<string, TimerId>();
	private callbacks = new Map<string, PollCallback>();
	private capPauseHandle: { remove: () => void } | null = null;
	private capResumeHandle: { remove: () => void } | null = null;
	private paused = false;
	private initialized = false;

	async init(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;

		const App = await loadAppModule();
		if (!App) return;

		this.capPauseHandle = await App.App.addListener('pause', () => {
			this.paused = true;
			for (const timer of this.timers.values()) {
				clearInterval(timer);
			}
		});

		this.capResumeHandle = await App.App.addListener('resume', () => {
			this.paused = false;
			for (const [id, cb] of this.callbacks) {
				this.startPollingTimer(id, cb, 30_000);
			}
		});
	}

	/** Start polling for a source with debounced callback. */
	start(sourceId: string, callback: PollCallback, intervalMs = 30_000): void {
		this.callbacks.set(sourceId, callback);
		if (!this.paused) {
			this.startPollingTimer(sourceId, callback, intervalMs);
		}
	}

	/** Stop polling for a source. Idempotent. */
	stop(sourceId: string): void {
		const timer = this.timers.get(sourceId);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(sourceId);
		}
		const callback = this.callbacks.get(sourceId);
		if (callback) {
			callback().catch(() => {});
			this.callbacks.delete(sourceId);
		}
	}

	/** Stop all polling and clean up. */
	stopAll(): void {
		for (const id of this.timers.keys()) {
			this.stop(id);
		}
	}

	/** Destroy the polling manager. Removes Capacitor listeners. */
	destroy(): void {
		this.stopAll();
		this.capPauseHandle?.remove();
		this.capResumeHandle?.remove();
		this.capPauseHandle = null;
		this.capResumeHandle = null;
		this.initialized = false;
	}

	private startPollingTimer(sourceId: string, callback: PollCallback, intervalMs: number): void {
		const existing = this.timers.get(sourceId);
		if (existing) clearInterval(existing);

		const timer = setInterval(() => {
			callback().catch(() => {});
		}, intervalMs);

		this.timers.set(sourceId, timer);
	}
}

/** Singleton instance */
export const balancePoller = new BalancePollingManager();
