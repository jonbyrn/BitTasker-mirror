import type { LayoutLoad } from '../$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { tryCatch } from '$lib/utils/tryCatch';
import { user } from '$lib/stores/user.store';
import { authState } from '$lib/stores/auth.store';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import userService from '$lib/api/services/user.service';

export const load: LayoutLoad = async () => {
	if (browser) {
		const { data: token, error: tokenError } = await tryCatch(
			Preferences.get({ key: StorageKeys.ACCESS_TOKEN })
		);
		if (tokenError || !token || token === null) {
			throw redirect(303, '/auth');
		}

		const { data: userData, error: userDataError } = await tryCatch(userService.getUserProfile());
		if (userDataError) throw redirect(303, '/auth');

		user.set(userData);
		authState.login();

		// Check if the user has completed the onboarding process, if yes, redirect to the dashboard
		const isOnboarding = userData.onboardingComplete;

		if (isOnboarding) {
			throw redirect(303, '/dashboard');
		}

		return { user: userData };
	}

	return {};
};
