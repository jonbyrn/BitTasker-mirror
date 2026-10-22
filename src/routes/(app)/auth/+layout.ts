import type { LayoutLoad } from './$types';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { StorageKeys } from '$lib/utils/constants/storage';
import { isCaptchaVerified } from '$lib/stores/auth.store';
import { Preferences } from '@capacitor/preferences';
import { consumeDeepLink } from '$lib/utils/deep-link';

export const load: LayoutLoad = async ({ url }) => {
	if (!browser) return;

	const token = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

	// If user is logged in and not in onboarding, redirect to dashboard
	if (token.value) {
		if (url.pathname.includes('/onboarding')) {
			return { currentStep: 2 };
		} else {
			// Check for a pending deep link before defaulting to /hiring
			const deepLink = await consumeDeepLink();
			if (deepLink) {
				redirect(303, deepLink);
			}
			redirect(303, '/hiring');
		}
	} else {
		if (url.pathname.includes('/onboarding')) {
			// A fresh visit has an empty in-memory captcha flag, including on preview
			// hosts. Signup sets the flag after its own Turnstile skip, then navigates here.
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
		}
	}
};
