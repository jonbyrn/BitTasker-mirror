import type { LayoutLoad } from './$types';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { StorageKeys } from '$lib/utils/constants/storage';
import { authState, isCaptchaVerified } from '$lib/stores/auth.store';
import { Preferences } from '@capacitor/preferences';
import authService from '$lib/api/services/auth.service';

export const load: LayoutLoad = async ({ url }) => {
	if (!browser) return;

	const token = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

	// If user is logged in and not in onboarding, redirect to dashboard
	if (token.value) {
		if (url.pathname.includes('/onboarding')) {
			try {
				const onboardingStatus = await authService.checkOnboardingStatus();

				if (onboardingStatus.isComplete) {
					throw redirect(303, '/dashboard');
				}

				const profileFields = [
					'displayName',
					'profilePicture',
					'professionalTitle',
					'profileDescription',
					'skills'
				];
				const needsProfileStep = profileFields.some((field) =>
					onboardingStatus.missingFields.includes(field)
				);

				// Current onboarding steps: 0 display name, 1 passkey, 2 profile, 3 recovery, 4 complete.
				// Logged-in users have already completed display name + passkey, so resume at profile or recovery.
				return { currentStep: needsProfileStep ? 2 : 3 };
			} catch (error) {
				console.error('Error checking onboarding status:', error);
				await authState.logout();
				throw redirect(303, '/auth/login');
			}
		}

		throw redirect(303, '/dashboard');
	}

	if (url.pathname.includes('/onboarding')) {
		await authState.logout();
		const verified = get(isCaptchaVerified);
		const e2eBypass =
			typeof import.meta !== 'undefined' && import.meta.env?.VITE_E2E_TURNSTILE_BYPASS === 'true';

		if (!verified && !e2eBypass) {
			console.warn(
				'[E2E] Auth layout redirect: isCaptchaVerified=false, redirecting to /auth/signup'
			);
			throw redirect(303, '/auth/signup');
		}

		if (e2eBypass) console.log('[E2E] Auth layout: allowing onboarding (E2E bypass env)');
		else console.log('[E2E] Auth layout: allowing onboarding (isCaptchaVerified=true)');
	}
};
