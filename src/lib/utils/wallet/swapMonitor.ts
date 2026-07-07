/**
 * Swap resume handler — triggers swap recovery and balance refresh
 * when the app returns from background.
 *
 * Uses visibilitychange (web) and Capacitor appStateChange (native).
 * Dedicated listener (not reused from +layout.svelte) because:
 * - Different timing: 2s delay vs 30s notification debounce
 * - Different lifecycle: registers/unregisters with wallet init
 * - Different domain: wallet logic, not app shell
 */

import { browser } from '$app/environment';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('wallet:swap-monitor');

let resumeTimer: ReturnType<typeof setTimeout> | null = null;
let onResumeCallback: (() => Promise<void>) | null = null;
let isRegistered = false;
let capacitorListenerHandle: { remove: () => Promise<void> } | null = null;

const RESUME_DELAY_MS = 2000;

function handleVisibilityChange(): void {
	if (document.visibilityState === 'visible') {
		d.log('App resumed (web)');
		scheduleResumeRecovery();
	}
}

function scheduleResumeRecovery(): void {
	if (resumeTimer) clearTimeout(resumeTimer);
	resumeTimer = setTimeout(() => {
		resumeTimer = null;
		onResumeCallback?.().catch((err: unknown) => {
			d.error('Swap recovery on resume failed:', err);
		});
	}, RESUME_DELAY_MS);
}

/**
 * Register the resume handler. Called once from wallet.store initialize().
 * Adds ~0ms latency — just wires event listeners, no work at registration time.
 */
export function registerSwapResumeHandler(callback: () => Promise<void>): void {
	if (!browser || isRegistered) return;

	onResumeCallback = callback;
	isRegistered = true;

	document.addEventListener('visibilitychange', handleVisibilityChange);

	void import('@capacitor/app')
		.then(({ App }) => {
			App.addListener('appStateChange', ({ isActive }) => {
				if (isActive) {
					d.log('App resumed (native)');
					scheduleResumeRecovery();
				}
			}).then((handle) => {
				capacitorListenerHandle = handle;
			});
		})
		.catch((err: unknown) => {
			if (import.meta.env.DEV) {
				d.warn('[swap-monitor] Capacitor app listener unavailable:', err);
			}
		});

	d.log('Swap resume handler registered');
}

/**
 * Unregister the resume handler. Called from wallet.store disconnectWallet().
 */
export function unregisterSwapResumeHandler(): void {
	if (!browser || !isRegistered) return;

	document.removeEventListener('visibilitychange', handleVisibilityChange);
	capacitorListenerHandle?.remove();
	capacitorListenerHandle = null;
	if (resumeTimer) clearTimeout(resumeTimer);
	resumeTimer = null;
	onResumeCallback = null;
	isRegistered = false;

	d.log('Swap resume handler unregistered');
}
