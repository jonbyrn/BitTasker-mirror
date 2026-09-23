// @ts-nocheck
import type { LayoutLoad } from './$types';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { StorageKeys } from '$lib/utils/constants/storage';
import { isCaptchaVerified } from '$lib/stores/auth.store';
import { Preferences } from '@capacitor/preferences';
import { consumeDeepLink, isValidInternalPath } from '$lib/utils/deep-link';

const isStaleAuthRedirect = (target: string): boolean =>
	target === '/hiring' || target === '/hiring/my-tasks';

export const load = async ({ url }: Parameters<LayoutLoad>[0]) => {
	if (!browser) return;

	const token = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

	// If user is logged in and not in onboarding, redirect to dashboard
	if (token.value) {
		if (url.pathname.includes('/onboarding')) {
			return { currentStep: 2 };
		} else {
			// Check for a pending deep link or redirect parameter before defaulting to the wallet.
			const deepLink = await consumeDeepLink();
			const redirectTo = url.searchParams.get('redirectTo');
			const target = [deepLink, redirectTo].find(
			(candidate): candidate is string =>
				Boolean(candidate) && isValidInternalPath(candidate) && !isStaleAuthRedirect(candidate)
			);
			redirect(303, target ?? '/wallet');
		}
	} else {
		if (url.pathname.includes('/onboarding')) {
			const verified = get(isCaptchaVerified);
			// E2E: allow onboarding when bypass env is set so we don't rely on store timing (CI race)
			const e2eBypass =
				typeof import.meta !== 'undefined' && import.meta.env?.VITE_E2E_TURNSTILE_BYPASS === 'true';
			if (!verified && !e2eBypass) {
				if (import.meta.env.DEV) {
					console.warn(
						'[E2E] Auth layout redirect: isCaptchaVerified=false, redirecting to /auth/signup'
					);
				}
				redirect(303, '/auth/signup');
			}
			if (import.meta.env.DEV) {
				if (e2eBypass) console.log('[E2E] Auth layout: allowing onboarding (E2E bypass env)');
				else console.log('[E2E] Auth layout: allowing onboarding (isCaptchaVerified=true)');
			}
		}
	}
};
