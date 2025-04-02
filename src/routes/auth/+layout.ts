import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { tryCatch } from '$lib/utils/tryCatch';
import { getUserProfile } from '$lib/services/user.service';
import { user } from '$lib/stores/user.store';
import { authState } from '$lib/stores/auth.store';
import type { LayoutLoad } from '../$types';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

export const load: LayoutLoad = async () => {
	if (browser) {
		const tokenResult = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
		const token = tokenResult.value;

		if (!token) {
			console.log('No token on auth page, skipping getUserProfile');
			return {};
		}

		const { data: userData, error: userError } = await tryCatch(getUserProfile());

		// If we successfully get user data, user is logged in
		if (!userError && userData) {
			user.set(userData);
			authState.login();

			// Check onboarding status and redirect accordingly
			if (userData.onboardingComplete) {
				throw redirect(303, '/dashboard');
			} else {
				throw redirect(303, '/onboarding');
			}
		} else {
			// If there's an error or no user data, remove the invalid/expired token and continue to auth page
			await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });
			console.log('Invalid or expired token, removed token, returning to auth page');
			return {};
		}
	}

	return {};
};
