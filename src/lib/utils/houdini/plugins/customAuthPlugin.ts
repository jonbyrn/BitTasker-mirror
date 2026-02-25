import { Preferences } from '@capacitor/preferences';
import type { ClientPlugin } from '$houdini';
import { goto } from '$app/navigation';
import { resolve as resolvePath } from '$app/paths';
import { browser } from '$app/environment';
import { StorageKeys } from '$lib/utils/constants/storage';
import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';

/**
 * Houdini auth plugin: adds token and device ID to requests, handles 401 logout.
 *
 * Design:
 * - Token state is module-level (single source of truth). Init runs on first factory
 *   call when browser is true, and at most once per module load (guarded by tokenInitPromise).
 * - tokenExplicitlySet ensures initializeToken() never overwrites currentToken after
 *   user or auth-store actions (setAccessToken, clearPluginTokenCache, syncTokenFromPreferences,
 *   or 401 logout). This prevents races where a late init would restore a stale token.
 */

/** Convert Headers, HeadersInit, or plain object to a plain object for merging. */
function headersToObject(
	headers: Headers | Record<string, string> | [string, string][] | undefined
): Record<string, string> {
	if (headers == null) return {};
	// Array of [key, value] tuples (HeadersInit)
	if (Array.isArray(headers)) {
		return Object.fromEntries(headers) as Record<string, string>;
	}
	// Duck-type Headers (works across realms / test envs where instanceof can fail)
	const h = headers as Headers;
	if (typeof h.entries === 'function') {
		const out: Record<string, string> = {};
		for (const [key, value] of h.entries()) {
			out[key] = value;
		}
		return out;
	}
	return { ...(headers as Record<string, string>) };
}

/** True if the GraphQL value indicates an auth failure (401). */
function isAuthFailure(
	value:
		| {
				errors?: Array<{
					message?: string;
					extensions?: { code?: string; originalError?: { statusCode?: number } };
				}> | null;
		  }
		| null
		| undefined
): boolean {
	if (value == null) return false;
	const errors = value.errors;
	if (!errors?.length) return false;
	return errors.some(
		(err) =>
			Number(err.extensions?.originalError?.statusCode) === 401 ||
			(err.extensions?.code === 'UNAUTHENTICATED' &&
				Number(err.extensions?.originalError?.statusCode) === 401)
	);
}

// --- Module-level state (single source of truth) ---
let currentToken: string | null = null;
let tokenInitialized = false;
let tokenInitPromise: Promise<void> | null = null;
let logoutInProgress = false;
let currentDeviceId: string | null = null;
/** When true, init must not overwrite currentToken (user called setAccessToken/clearPluginTokenCache). */
let tokenExplicitlySet = false;

/**
 * Clears the auth plugin's in-memory token cache. Call from TokenManager.clearToken()
 * and from auth store logout so the next request does not send a stale token.
 */
export function clearPluginTokenCache(): void {
	tokenExplicitlySet = true;
	currentToken = null;
}

/**
 * Re-reads the access token from Preferences and updates the plugin's in-memory cache.
 * Never throws; on failure logs and leaves cache unchanged.
 */
export async function syncTokenFromPreferences(): Promise<void> {
	if (!browser) return;
	try {
		const result = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
		currentToken = result?.value ?? null;
		tokenExplicitlySet = true; // prevent late initializeToken() from overwriting
	} catch (error) {
		console.error('[AuthPlugin] syncTokenFromPreferences failed:', error);
	}
}

/**
 * Single source of truth write: persist token to Preferences and update plugin cache.
 * Call from auth store setupAuthData and TokenManager.setToken so the next request sends the token.
 * Empty or whitespace-only token clears the token (no Authorization on next request).
 */
export async function setAccessToken(token: string): Promise<void> {
	if (!browser) return;
	tokenExplicitlySet = true;
	if (!token || typeof token !== 'string' || !token.trim()) {
		currentToken = null;
		await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });
		return;
	}
	await Preferences.set({ key: StorageKeys.ACCESS_TOKEN, value: token });
	currentToken = token;
}

/** Initialize token from Preferences; never throws. Sets tokenInitialized in finally. Does not overwrite currentToken if user already set/cleared it. */
async function initializeToken(): Promise<void> {
	if (!browser) return;
	try {
		const result = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
		if (!tokenExplicitlySet) {
			currentToken = result?.value ?? null;
		}
	} catch (error) {
		console.error('[AuthPlugin] Token initialization failed:', error);
	} finally {
		tokenInitialized = true;
	}
}

/** Initialize device ID; fire-and-forget, never blocks. */
async function initializeDeviceId(): Promise<void> {
	if (!browser) return;
	try {
		currentDeviceId = await getDeviceIdentifier();
	} catch (error) {
		console.error('[AuthPlugin] Device ID initialization failed:', error);
	}
}

/**
 * Comprehensive auth plugin that:
 * 1. Adds auth token to outgoing requests
 * 2. Adds device ID to outgoing requests
 * 3. Handles auth errors in responses
 */
const authPlugin: ClientPlugin = () => {
	// Start init at most once per module load (tokenInitPromise guard prevents double init).
	if (browser && !tokenInitialized && !tokenInitPromise) {
		tokenInitPromise = initializeToken();
		initializeDeviceId(); // fire-and-forget; does not block requests
	}

	return {
		beforeNetwork: async (ctx, { next }) => {
			if (!browser) {
				return next(ctx);
			}

			if (!tokenInitialized && tokenInitPromise) {
				await tokenInitPromise;
			}

			let existingHeaders: Record<string, string>;
			try {
				existingHeaders = headersToObject(ctx.fetchParams?.headers);
			} catch (error) {
				console.error('[AuthPlugin] headersToObject failed, using empty headers:', error);
				existingHeaders = {};
			}
			ctx.fetchParams = {
				...(ctx.fetchParams || {}),
				headers: {
					...existingHeaders,
					...(currentToken && { Authorization: `Bearer ${currentToken}` }),
					...(currentDeviceId && { 'X-Device-ID': currentDeviceId })
				}
			};

			return next(ctx);
		},

		end: async (ctx, { value, resolve }) => {
			let shouldRedirect = false;
			try {
				if (value == null) return;

				if (isAuthFailure(value)) {
					if (browser && !logoutInProgress) {
						logoutInProgress = true;
						try {
							console.warn('[AuthPlugin] Detected auth error. Logging out...');
							tokenExplicitlySet = true; // prevent late initializeToken() from overwriting
							currentToken = null;
							await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });

							const { authState } = await import('$lib/stores/auth.store');
							await authState.logout();
							shouldRedirect = true;
						} catch (err) {
							console.error('[AuthPlugin] Logout/cleanup error:', err);
						} finally {
							logoutInProgress = false;
						}
					}
				}
			} finally {
				resolve(ctx);
				if (shouldRedirect) {
					const loginPath = resolvePath('/auth/login', {} as Record<string, string>);
					const nav = goto(loginPath);
					if (typeof nav?.catch === 'function') {
						void nav.catch((err: unknown) => {
							console.error('[AuthPlugin] Redirect failed:', err);
						});
					}
				}
			}
		}
	};
};

export const TokenManager = {
	async setToken(token: string): Promise<void> {
		await setAccessToken(token);
	},

	async clearToken(): Promise<void> {
		if (browser) {
			try {
				await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });
			} finally {
				clearPluginTokenCache();
			}
		}
	}
};

export default authPlugin;
