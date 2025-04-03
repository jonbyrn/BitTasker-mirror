import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { user } from '$lib/stores/user.store';
import { authState } from '$lib/stores/auth.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { tryCatch } from '$lib/utils/tryCatch';
import userService from '$lib/api/services/user.service';

export const load: LayoutLoad = async () => {
	// Only check authentication on the client side
	if (browser) {	
		const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

		if (!token || token === null) {
			console.log('no token');
			throw redirect(303, '/auth');
		}

		const { data: userData, error: userError } = await tryCatch(userService.getUserProfile());
		if (userError || !userData || userData === null) {
			console.error('Error fetching user profile', userError);
			await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });
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
