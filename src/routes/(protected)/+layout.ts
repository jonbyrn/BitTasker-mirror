import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect, isRedirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { authState } from '$lib/stores/auth.store';
import { setAccessToken } from '$lib/utils/houdini/plugins/customAuthPlugin';
import { StorageKeys } from '$lib/utils/constants/storage';
import authService from '$lib/api/services/auth.service';
import { ApiError } from '$lib/api/apiService';

export const load: LayoutLoad = async ({ url }) => {
	if (browser) {
		try {
			const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

			if (!token || token === null) {
				redirect(303, '/auth/login');
			} else {
				try {
					await setAccessToken(token);
					// Validate token with API (e.g. onboarding status); 401 → logout and redirect or re-auth
					try {
						await authService.checkOnboardingStatus();
					} catch (validateError) {
						if (validateError instanceof ApiError && validateError.status === 401) {
							const { value: authMethod } = await Preferences.get({
								key: StorageKeys.AUTH_METHOD
							});
							const { value: storedCredentialId } = await Preferences.get({
								key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
							});
							const canReauth =
								authMethod === 'passkey' &&
								storedCredentialId != null &&
								storedCredentialId !== '';
							if (canReauth) {
								return {
									reauthRequired: true,
									allowCredentialIds: [storedCredentialId],
									currentPath: url.pathname
								};
							}
							await authState.logout();
							redirect(303, '/auth/login');
						}
						// Non-401 (network, 5xx): allow access so app works when API is temporarily down
						console.warn('[protected layout] Token check failed (non-401):', validateError);
					}
					await authState.login();
				} catch (syncError) {
					console.error('[protected layout] Failed to sync token to plugin:', syncError);
					redirect(303, '/auth/login');
				}
			}
		} catch (error) {
			// Re-throw redirects so SvelteKit can handle them
			if (isRedirect(error)) {
				throw error;
			}
			console.error(error);
		}
	}
};

// Disable SSR for protected routes in Capacitor
export const ssr = false;
