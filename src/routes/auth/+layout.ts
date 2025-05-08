import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

export const load: LayoutLoad = async ({ url }) => {
	try {
		// Check if user is already logged in
		const token = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
		
		// If user is logged in and not in onboarding, redirect to dashboard
		if (token.value && !url.pathname.includes('/onboarding')) {
			// Get onboarding status
			const onboardingComplete = await Preferences.get({ key: StorageKeys.ONBOARDING_COMPLETED });
			
			// Check onboarding status and redirect accordingly
			if (!onboardingComplete.value) {
				redirect(303, '/onboarding');
			} else {
				redirect(303, '/dashboard');
			}
		}
	} catch (error) {
		console.error('Error in auth layout check:', error);
		// Continue to auth pages even if there's an error
	}

	return {};
};
