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
				} else {
					const fields = ['displayName', 'profilePicture', 'professionalTitle', 'profileDescription', 'skills']; // field 'location' left out for step 4 
					const step3 = fields.filter(field => onboardingStatus.missingFields.includes(field)).length > 0

					return { currentStep: step3 ? 3 : 4 };
				}
			} catch (error) {
				console.error('Error checking onboarding status:', error);
				// If error checking onboarding status, log out user
				await authState.logout();
				throw redirect(303, '/auth/login');
			}
		} else {
			throw redirect(303, '/dashboard');
		}
	} else {
		if (url.pathname.includes('/onboarding')) {
			await authState.logout();
			const verified = get(isCaptchaVerified);
			// E2E: allow onboarding when bypass env is set so we don't rely on store timing (CI race)
			const e2eBypass =
				typeof import.meta !== 'undefined' && import.meta.env?.VITE_E2E_TURNSTILE_BYPASS === 'true';
			if (!verified && !e2eBypass) {
				// Diagnostic: visible in Playwright page console and CI attachments when redirect happens
				console.warn('[E2E] Auth layout redirect: isCaptchaVerified=false, redirecting to /auth/signup');
				throw redirect(303, '/auth/signup');
			}
			// Diagnostic: when we allow onboarding
			if (e2eBypass) console.log('[E2E] Auth layout: allowing onboarding (E2E bypass env)');
			else console.log('[E2E] Auth layout: allowing onboarding (isCaptchaVerified=true)');
		}
	}
};
