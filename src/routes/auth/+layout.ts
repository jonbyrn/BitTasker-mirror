import type { LayoutLoad } from './$types';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { CheckOnboardingStatusStore } from '$houdini';
import { StorageKeys } from '$lib/utils/constants/storage';
import { authState, isCaptchaVerified } from '$lib/stores/auth.store';
import { Preferences } from '@capacitor/preferences';

export const load: LayoutLoad = async ({ url }) => {
	if (!browser) return;

	const token = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

	// If user is logged in and not in onboarding, redirect to dashboard
	if (token.value) {
		if (url.pathname.includes('/onboarding')) {
			const isOnboardingCompleteStore = new CheckOnboardingStatusStore();
			const { data } = await isOnboardingCompleteStore.fetch();

			if (data?.IsOnboardingComplete.isComplete) {
				redirect(303, '/dashboard');
			} else {
				return { currentStep: 4 };
			}
		} else {
			redirect(303, '/dashboard');
		}
	} else {
		if (url.pathname.includes('/onboarding')) {
			await authState.logout();
			if (!get(isCaptchaVerified)) redirect(303, '/auth/signup');
		}
	}
};
