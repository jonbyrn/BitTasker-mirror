import { Preferences } from '@capacitor/preferences';
import type { ClientPlugin } from '$houdini';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { StorageKeys } from '$lib/utils/constants/storage';
import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';

interface GraphQLError {
	message: string;
	extensions?: {
		code: string;
		originalError?: {
			statusCode: number;
		};
	};
}

/**
 * Comprehensive auth plugin that:
 * 1. Adds auth token to outgoing requests
 * 2. Adds device ID to outgoing requests
 * 3. Handles auth errors in responses
 */
const authPlugin: ClientPlugin = () => {
	// Keep token and device ID in memory for synchronous access
	let cachedToken: string | null = null;
	let cachedDeviceId: string | null = null;
	let tokenInitialized = false;
	let tokenInitPromise: Promise<void> | null = null;

	// Initialize token only — single Preferences.get() call, resolves quickly
	const initializeToken = async (): Promise<void> => {
		if (!browser) return;

		try {
			const result = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
			cachedToken = result.value;
		} catch (error) {
			console.error('[AuthPlugin] Token initialization failed:', error);
		} finally {
			// Always mark as initialized so beforeNetwork never blocks twice
			tokenInitialized = true;
		}
	};

	// Initialize device ID separately — fire-and-forget, does NOT block requests.
	// On first visit this can take several async hops (Device.getInfo, Device.getId,
	// sha256 fingerprint, Preferences.set). Requests that fire before it resolves
	// simply omit the X-Device-ID header; subsequent requests will have it cached.
	const initializeDeviceId = async (): Promise<void> => {
		if (!browser) return;

		try {
			cachedDeviceId = await getDeviceIdentifier();
		} catch (error) {
			console.error('[AuthPlugin] Device ID initialization failed:', error);
		}
	};

	// Start initialization immediately in browser
	if (browser) {
		// Token init blocks the first request; device ID init does not
		tokenInitPromise = initializeToken();
		initializeDeviceId(); // intentionally not awaited
	}

	return {
		// Add auth token and device ID to outgoing requests
		beforeNetwork: async (ctx, { next }) => {
			if (!browser) {
				return next(ctx);
			}

			// Only await token initialization — fast (single localStorage read after
			// the Capacitor web plugin loads on the first call).
			// Device ID is used opportunistically: included when ready, omitted when not.
			if (!tokenInitialized && tokenInitPromise) {
				await tokenInitPromise;
			}

			// Add headers to outgoing request
			ctx.fetchParams = {
				...(ctx.fetchParams || {}),
				headers: {
					...(ctx.fetchParams?.headers || {}),
					...(cachedToken && { Authorization: `Bearer ${cachedToken}` }),
					...(cachedDeviceId && { 'X-Device-ID': cachedDeviceId })
				}
			};

			next(ctx);
		},

		// Handle auth errors in responses
		end: async (ctx, { value, resolve }) => {
			let shouldRedirect = false;

			if (value.errors && value.errors.length > 0) {
				const authError = value.errors.find(
					(err: GraphQLError) =>
						err.extensions?.code === 'UNAUTHENTICATED' &&
						err.extensions?.originalError?.statusCode === 401
				);

				if (authError) {
					console.warn('[AuthPlugin] Detected auth error. Logging out...');

					if (browser) {
						cachedToken = null;
						await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });

						const { authState } = await import('$lib/stores/auth.store');
						authState.logout();
						shouldRedirect = true;
					}
				}
			}

			resolve(ctx);

			if (shouldRedirect) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				goto('/auth/login');
			}
		}
	};
};

// Export methods to manage token - only perform operations in browser
export const TokenManager = {
	async setToken(token: string): Promise<void> {
		if (browser) {
			await Preferences.set({
				key: StorageKeys.ACCESS_TOKEN,
				value: token
			});
		}
	},

	async clearToken(): Promise<void> {
		if (browser) {
			await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });
		}
	}
};

export default authPlugin;
