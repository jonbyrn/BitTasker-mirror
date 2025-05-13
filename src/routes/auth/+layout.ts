import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { StorageKeys } from '$lib/utils/constants/storage';
import { browser } from '$app/environment';

export const load: LayoutLoad = async ({ url }) => {
	if (!browser) return;

	// Dynamically import Preferences only in the browser
	const { Preferences } = await import('@capacitor/preferences');
	const token = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

	// If user is logged in and not in onboarding, redirect to dashboard
	if (token.value && !url.pathname.includes('/onboarding')) {
		redirect(303, '/dashboard');

		// TODO: Revise the following code, Check onboarding status and redirect accordingly
		// if (!onboardingComplete.value) {
		// 	redirect(303, '/onboarding');
		// } else {
		// 	redirect(303, '/dashboard');
		// }
	}
};
