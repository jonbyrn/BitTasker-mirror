import type { ClientPlugin } from '$houdini';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { StorageKeys } from '$lib/utils/constants/storage';
import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';

// Only import Capacitor modules in browser
let Preferences: any = null;
if (browser) {
	import('@capacitor/preferences').then(module => {
		Preferences = module.Preferences;
	});
}

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
	// Keep token in memory for synchronous access
	let cachedToken: string | null = null;
	let tokenInitialized = false;
	let tokenInitPromise: Promise<void> | null = null;

	// Initialize token function
	const initializeToken = async (): Promise<void> => {
		if (!browser || !Preferences) return;

		try {
			const result = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
			cachedToken = result.value;
		} catch (error) {
			console.error('Failed to initialize token:', error);
			cachedToken = null;
		} finally {
			if (cachedToken) tokenInitialized = true;
		}
	};

	// Start initialization only in browser and after Preferences is loaded
	if (browser) {
		// Create initialization promise right away
		tokenInitPromise = new Promise<void>(resolve => {
			// Delay initialization until Preferences is loaded
			const checkAndInit = () => {
				if (Preferences) {
					initializeToken().then(resolve);
				} else {
					// Check again in 50ms
					setTimeout(checkAndInit, 50);
				}
			};

			checkAndInit();
		});
	}

	return {
		// Add auth token and device ID to outgoing requests
		beforeNetwork: async (ctx, { next }) => {
			// Only run in browser environment
			if (browser) {
				// Always ensure token is initialized before proceeding
				if (!tokenInitialized && tokenInitPromise) {
					await tokenInitPromise;
					console.log('Token initialization complete. Token exists:', !!cachedToken);
				}

				// Get device ID directly (it's fast enough to do on each request)
				const deviceId = await getDeviceIdentifier();

				// Create or extend the fetch params with headers
				ctx.fetchParams = {
					...(ctx.fetchParams || {}),
					headers: {
						...(ctx.fetchParams?.headers || {}),
						...(cachedToken && { Authorization: `Bearer ${cachedToken}` }),
						...(deviceId && { 'X-Device-ID': deviceId })
					}
				};

				// Continue the request pipeline
				next(ctx);
			}
		},

		// Handle auth errors in responses
		end: async (ctx, { value, resolve }) => {
			if (value.errors && value.errors.length > 0) {
				console.warn('encountered errors:', value.errors);

				const authError = value.errors.find(
					(err: GraphQLError) =>
						err.extensions?.code === 'UNAUTHENTICATED' &&
						err.extensions?.originalError?.statusCode === 401
				);

				if (authError) {
					console.warn('Detected auth error. Logging out...', authError);

					// Only run Capacitor/browser-specific code in the browser
					if (browser && Preferences) {
						// Clear cached token
						cachedToken = null;

						// Remove token from storage
						await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });

						// Redirect to auth page
						const { authState } = await import('$lib/stores/auth.store');
						authState.logout();
						goto('/auth/login');
					}
				}
			}

			resolve(ctx);
		}
	};
};

// Export methods to manage token - only perform operations in browser
export const TokenManager = {
	async setToken(token: string): Promise<void> {
		if (browser && Preferences) {
			await Preferences.set({
				key: StorageKeys.ACCESS_TOKEN,
				value: token
			});
		}
	},

	async clearToken(): Promise<void> {
		if (browser && Preferences) {
			await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });
		}
	}
};

export default authPlugin;

