import type { LayoutLoad } from './$types';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { CheckOnboardingStatusStore } from '$houdini';
import { StorageKeys } from '$lib/utils/constants/storage';
import { isCaptchaVerified } from '$lib/stores/auth.store';

export const load: LayoutLoad = async ({ url }) => {
	if (!browser) return;

	// Dynamically import Preferences only in the browser
	const { Preferences } = await import('@capacitor/preferences');
	const token = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

	// If user is logged in and not in onboarding, redirect to dashboard
	if (token.value) {
		if (url.pathname.includes('/onboarding')) {
			const isOnboardingCompleteStore = new CheckOnboardingStatusStore();
			const { data } = await isOnboardingCompleteStore.fetch();

			if (data?.IsOnboardingComplete.isComplete) {
				redirect(303, '/dashboard');
			} else {
				return { currentStep: 1 };
			}
		} else {
			redirect(303, '/dashboard');
		}
	} else {
		if (url.pathname.includes('/onboarding')) {
			// if (!get(isCaptchaVerified)) {
			// 	redirect(303, '/auth/signup');
			// }
		}
	}
};
