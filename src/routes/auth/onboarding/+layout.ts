// TODO: Recently created, needs to be verified for usability
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { Preferences } from '@capacitor/preferences';

export const load: LayoutLoad = async ({ url }) => {
	// Check if there's active onboarding data in progress
	try {
		const onboardingData = await Preferences.get({ key: 'bittasker_onboarding_data' });
		
		// If there's no onboarding data and we're not on the account setup page, redirect to account setup
		if (!onboardingData.value && !url.pathname.includes('/account-setup')) {
			redirect(302, '/auth/onboarding/account-setup');
		}
		
		// If we're on the completion page, let it handle its own checks
		if (url.pathname.includes('/complete')) {
			return {};
		}
	} catch (error) {
		console.error('Error checking onboarding state:', error);
		// If there's an error, redirect to signup
		redirect(302, '/auth/signup');
	}

	return {};
}; 