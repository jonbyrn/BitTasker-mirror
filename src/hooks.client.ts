import '$lib/polyfills';
import { Buffer } from 'buffer';
import process from 'process';

type NodeGlobals = {
	Buffer?: typeof Buffer;
	process?: typeof process;
};

function assignNodeGlobals(target: NodeGlobals): void {
	if (!target.Buffer) target.Buffer = Buffer;
	target.process = process;
}

if (typeof window !== 'undefined') {
	assignNodeGlobals(window as Window & NodeGlobals);
}
if (typeof globalThis !== 'undefined') {
	assignNodeGlobals(globalThis as typeof globalThis & NodeGlobals);
}

import type { HandleClientError } from '@sveltejs/kit';
import { init as initSentry, replayIntegration, handleErrorWithSentry } from '@sentry/sveltekit';
import { exposeInitWasm } from '$lib/wasm/init-wasm';
import { purgeStaleClientInBrowser } from '$lib/utils/purge-stale-client';
// Eagerly pull BaseApiService into the entry bundle so it is guaranteed to be fully
// evaluated before any route chunk that extends it. This, combined with the
// manualChunks isolation in vite.config.ts, eliminates the circular chunk dependency
// that causes "TypeError: Class extends value undefined" (BITTASKER-DEV-1X).
import '$lib/api/apiService';

if (process.env.NODE_ENV !== 'development') {
	initSentry({
		dsn: import.meta.env.VITE_SENTRY_DSN,

		tracesSampleRate: 1.0,

		// Enable logs to be sent to Sentry
		enableLogs: true,

		// This sets the sample rate to be 10%. You may want this to be 100% while
		// in development and sample at a lower rate in production
		replaysSessionSampleRate: 0.1,

		// If the entire session is not sampled, use the below sample rate to sample
		// sessions when an error occurs.
		replaysOnErrorSampleRate: 1.0,

		// If you don't want to use Session Replay, just remove the line below:
		integrations: [replayIntegration()],

		// Disable sending user PII (IP address, cookies, user info) to Sentry.
		// https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
		sendDefaultPii: false
	});
}

/**
 * handleErrorWithSentry captures the error for Sentry first, then our callback runs.
 * This catches chunk errors that bypass the vite:preloadError listener in +layout.svelte
 * (e.g. errors surfaced directly through SvelteKit's error boundary).
 * The same version-scoped sessionStorage key used in +layout.svelte ensures
 * that the two layers never conflict: whichever fires first sets the flag.
 */

/**
 * SvelteKit client init hook — runs before the app hydrates. Sentry is already
 * initialized above at module scope; this export satisfies the client app's
 * expected `init` hook contract.
 */
export async function init(): Promise<void> {
	exposeInitWasm();
	await purgeStaleClientInBrowser();
}

export const handleError: HandleClientError = handleErrorWithSentry(({ error }) => {
	if (process.env.NODE_ENV === 'development') {
		// Sentry's wrapper replaces the returned message before it reaches +error.svelte — preserve the stack here.
		console.error(error);
	}

	const message = (error as Error)?.message ?? '';
	const isChunkError =
		message.toLowerCase().includes('failed to fetch dynamically imported module') ||
		(error as Error)?.name === 'ChunkLoadError';

	if (isChunkError) {
		const CHUNK_RELOAD_KEY = `chunk-reload-${__BUILD_VERSION__}`;
		if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
			// Sentry already queued the event above via handleErrorWithSentry.
			// Set the flag then reload — the page will not display an error UI.
			sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
			location.reload();
			return { message: 'Reloading to apply updates…' };
		}
		// Flag already set: reloading did not fix it. Persistent error — surface it.
		return { message: 'An error occurred loading the application. Please refresh.' };
	}

	return {
		message: 'Whoops! An error occurred'
	};
});
