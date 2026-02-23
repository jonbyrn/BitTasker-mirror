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
	let initialized = false;
	let initPromise: Promise<void> | null = null;

	// Initialize function
	const initialize = async (): Promise<void> => {
		if (!browser) return;

		try {
			// Fetch token and device ID in parallel for speed
			const [tokenResult, deviceId] = await Promise.all([
				Preferences.get({ key: StorageKeys.ACCESS_TOKEN }),
				getDeviceIdentifier()
			]);

			cachedToken = tokenResult.value;
			cachedDeviceId = deviceId;
		} catch (error) {
			console.error('[AuthPlugin] Initialization failed:', error);
		} finally {
			initialized = true;
		}
	};

	// Start initialization immediately in browser
	if (browser) {
		initPromise = initialize();
	}

	return {
		// Add auth token and device ID to outgoing requests
		beforeNetwork: async (ctx, { next }) => {
			if (!browser) {
				return next(ctx);
			}

			// Always ensure initialization is complete
			if (!initialized && initPromise) {
				await initPromise;
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
