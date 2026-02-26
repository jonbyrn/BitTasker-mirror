import { writable, get } from 'svelte/store';

export interface RedirectRetryState {
	pending: boolean;
	target: string | null;
	countdown: number;
}

const initialState: RedirectRetryState = {
	pending: false,
	target: null,
	countdown: 0
};

export const redirectRetryStore = writable<RedirectRetryState>(initialState);

let intervalId: ReturnType<typeof setInterval> | null = null;
let gotoFn: ((path: string) => Promise<void>) | null = null;

/**
 * Start a countdown that retries navigation to targetPath after 3 seconds.
 * Call cleanupRedirectRetry in onDestroy to clear the interval.
 *
 * @param targetPath Path to navigate to (e.g. '/dashboard')
 * @param goto Navigation function (e.g. from $app/navigation)
 */
export function startRedirectRetryCountdown(
	targetPath: string,
	goto: (path: string) => Promise<void>
): void {
	gotoFn = goto;
	redirectRetryStore.set({
		pending: true,
		target: targetPath,
		countdown: 3
	});
	if (intervalId != null) {
		clearInterval(intervalId);
	}
	intervalId = setInterval(() => {
		const state = get(redirectRetryStore);
		if (state.countdown <= 0) {
			if (intervalId != null) {
				clearInterval(intervalId);
				intervalId = null;
			}
			const path = state.target;
			if (path && gotoFn) {
				gotoFn(path).catch((err) => {
					console.error('[redirectWithRetry] Redirect failed:', err);
					redirectRetryStore.update((s) => ({ ...s, countdown: -1 }));
				});
			}
			return;
		}
		redirectRetryStore.update((s) => ({ ...s, countdown: s.countdown - 1 }));
	}, 1000);
}

/**
 * Navigate to the current redirect target immediately (e.g. user clicked "Go to dashboard").
 */
export async function goToRedirectTarget(): Promise<void> {
	const state = get(redirectRetryStore);
	const path = state.target;
	if (!path) return;
	if (intervalId != null) {
		clearInterval(intervalId);
		intervalId = null;
	}
	if (!gotoFn) return;
	try {
		await gotoFn(path);
		redirectRetryStore.set(initialState);
		gotoFn = null;
	} catch (e) {
		console.error('[redirectWithRetry] Manual redirect failed:', e);
		redirectRetryStore.update((s) => ({ ...s, countdown: -1 }));
	}
}

/**
 * Clear the retry interval. Call from onDestroy when using redirect retry.
 */
export function cleanupRedirectRetry(): void {
	if (intervalId != null) {
		clearInterval(intervalId);
		intervalId = null;
	}
	gotoFn = null;
	redirectRetryStore.set(initialState);
}
