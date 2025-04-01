import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { tryCatch } from '$lib/utils/tryCatch';
import { getUserProfile } from '$lib/services/user.service';
import { user } from '$lib/stores/user.store';
import { authState } from '$lib/stores/auth.store';
import type { LayoutLoad } from '../$types';

export const load: LayoutLoad = async () => {
	if (browser) {
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
		}

		// If there's an error or no user data, continue to auth page
		return {};
	}

	return {};
};
