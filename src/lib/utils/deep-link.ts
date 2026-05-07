import { browser } from '$app/environment';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

/**
 * Pending deep link path — set by the Capacitor appUrlOpen listener before
 * SvelteKit routing runs. Held in-memory for synchronous access by load
 * functions; also persisted to Capacitor Preferences to survive WebView
 * restarts during auth redirects.
 */
let pendingPath: string | null = null;

// Restore any path saved during a previous WebView session
if (browser) {
	const result = Preferences.get({ key: StorageKeys.DEEP_LINK });
	if (result && typeof result.then === 'function') {
		result.then(({ value }) => {
			if (value) {
				pendingPath = value;
			}
		});
	}
}

async function persist(path: string): Promise<void> {
	pendingPath = path;
	await Preferences.set({ key: StorageKeys.DEEP_LINK, value: path });
}

async function clearStorage(): Promise<void> {
	pendingPath = null;
	await Preferences.remove({ key: StorageKeys.DEEP_LINK });
}

/**
 * Register the Capacitor appUrlOpen listener at module-load time so it is
 * ready before SvelteKit routing. Capacitor buffers the deep-link event
 * and replays it as soon as a listener is added.
 *
 * During initial app load the listener stores the path — the actual
 * navigation is handled by the root +page.ts load function. When the app
 * is already running (resumed from background) we navigate via goto().
 */
function registerDeepLinkListener(): void {
	if (!browser) return;

	try {
		App.addListener('appUrlOpen', (data: { url?: string }) => {
			if (data.url) {
				try {
					const url = new URL(data.url);
					// Normalise: custom schemes (bittasker://services) produce
					// pathname without a leading slash, which breaks SvelteKit routing.
					let pathname = url.pathname;
					if (pathname && !pathname.startsWith('/')) {
						pathname = '/' + pathname;
					}
					if (pathname && pathname !== '/' && isValidInternalPath(pathname)) {
						const target = pathname + (url.search || '');
						// Fire-and-forget — in-memory is set synchronously for the
						// immediate read by +page.ts; Preferences write is best-effort.
						persist(target);
						// Navigate directly when the app is already running.
						// On initial load goto may not be ready — root +page.ts handles it.
						import('$app/navigation').then(({ goto }) =>
							goto(target).catch(() => {
								/* let root +page.ts handle it */
							})
						);
					}
				} catch (error) {
					console.error('[deep-link] Error parsing URL:', error);
				}
			}
		});
	} catch {
		// @capacitor/app not available on this platform
	}
}

registerDeepLinkListener();

/**
 * Validate that a path is safe for internal navigation.
 * Rejects full URLs, protocol-relative URLs, and anything that doesn't
 * start with `/` to prevent open-redirect attacks.
 */
export function isValidInternalPath(path: string): boolean {
	return path.startsWith('/') && !path.startsWith('//');
}

/** Return the pending deep link path without consuming it (synchronous). */
export function getPendingDeepLink(): string | null {
	if (pendingPath && !isValidInternalPath(pendingPath)) {
		pendingPath = null;
		Preferences.remove({ key: StorageKeys.DEEP_LINK });
		return null;
	}
	return pendingPath;
}

/** Return and clear the pending deep link path. */
export async function consumeDeepLink(): Promise<string | null> {
	const path = pendingPath;
	await clearStorage();
	if (path && !isValidInternalPath(path)) {
		return null;
	}
	return path;
}
