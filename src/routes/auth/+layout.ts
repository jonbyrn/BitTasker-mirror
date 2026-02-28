import type { LayoutLoad } from './$types';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { StorageKeys } from '$lib/utils/constants/storage';
import { authState, isCaptchaVerified } from '$lib/stores/auth.store';
import { Preferences } from '@capacitor/preferences';

export const load: LayoutLoad = async ({ url }) => {
	// SSR: return default so data is never undefined (avoids "reading 'call'" / currentStep errors)
	if (!browser) {
		return { currentStep: 0 };
	}

	const token = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

	// If user is logged in, redirect to dashboard (onboarding is only for new signups)
	if (token.value) {
		redirect(303, '/dashboard');
	} else {
		if (url.pathname.includes('/onboarding')) {
			await authState.logout();
			const verified = get(isCaptchaVerified);
			// E2E: allow onboarding when bypass env is set so we don't rely on store timing (CI race)
			const e2eBypass =
				typeof import.meta !== 'undefined' && import.meta.env?.VITE_E2E_TURNSTILE_BYPASS === 'true';
			if (!verified && !e2eBypass) {
				// Diagnostic: visible in Playwright page console and CI attachments when redirect happens
				console.warn(
					'[E2E] Auth layout redirect: isCaptchaVerified=false, redirecting to /auth/signup'
				);
				redirect(303, '/auth/signup');
			}
			// Diagnostic: when we allow onboarding
			if (e2eBypass) console.log('[E2E] Auth layout: allowing onboarding (E2E bypass env)');
			else console.log('[E2E] Auth layout: allowing onboarding (isCaptchaVerified=true)');
			return { currentStep: 0 };
		}
	}
};
