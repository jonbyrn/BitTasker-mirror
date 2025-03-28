import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { getUserProfile, checkOnboardingStatus } from '$lib/services/user.service';
import { user } from '$lib/states/user.store';
import { authState } from '$lib/states/auth.store';
import { tryCatch } from '$lib/utils/tryCatch';

export const load: LayoutLoad = async () => {
	// Only check authentication on the client side
	if (browser) {
		// Moving away from traditional error handling to a more functional approach
		const { data: token, error: tokenError } = await tryCatch(
			Preferences.get({ key: 'access_token' })
		);

		if (tokenError || !token || token === null) {
			console.error('Error fetching access token', tokenError);
			throw redirect(303, '/auth');
		}

		// Check onboarding status
		const { data: onboardingStatus, error: onboardingError } =
			await tryCatch(checkOnboardingStatus());

		if (onboardingError) {
			console.error('Error checking onboarding status', onboardingError);
			throw redirect(303, '/auth');
		}
		if (onboardingStatus.completed === false) {
			redirect(303, '/onboarding');
		}

		// Fetch user profile
		const { data: userData, error: userError } = await tryCatch(getUserProfile());
		if (userError || !userData || userData === null) {
			console.error('Error fetching user profile', userError);
			throw redirect(303, '/auth');
		} else {
			user.set(userData);
			authState.login();
		}

		return { user: userData, onboardingStatus };
	}

	return {};
};

// Disable SSR for protected routes in Capacitor
export const ssr = false;
