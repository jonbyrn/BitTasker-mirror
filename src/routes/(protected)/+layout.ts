import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { getUserProfile } from '$lib/services/user.service';
import { user } from '$lib/stores/user.store';
import { authState } from '$lib/stores/auth.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { tryCatch } from '$lib/utils/tryCatch';

export const load: LayoutLoad = async () => {
	// Only check authentication on the client side
	if (browser) {
		const { data: token, error: tokenError } = await tryCatch(
			Preferences.get({ key: StorageKeys.ACCESS_TOKEN })
		);

		if (tokenError || !token || token === null) {
			console.error('Error fetching access token', tokenError);
			throw redirect(303, '/auth');
		}

		const { data: userData, error: userError } = await tryCatch(getUserProfile());
		if (userError || !userData || userData === null) {
			console.error('Error fetching user profile', userError);
			throw redirect(303, '/auth');
		} else {
			user.set(userData);
			authState.login();

			if (userData.onboardingComplete === false) {
				redirect(303, '/onboarding');
			}
		}

		return { user: userData };
	}

	return {};
};

// Disable SSR for protected routes in Capacitor
export const ssr = false;
