import type { LayoutLoad } from './$types';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { StorageKeys } from '$lib/utils/constants/storage';
import { isCaptchaVerified, skipSignupCaptcha } from '$lib/stores/auth-captcha';
import {
	hydrateSignupCaptcha,
	readOnboardingDraft,
	shouldRedirectOnboardingToSignup
} from '$lib/stores/onboarding-draft';
import { Preferences } from '@capacitor/preferences';
import { consumeDeepLink, isValidInternalPath } from '$lib/utils/deep-link';

const isStaleAuthRedirect = (target: string): boolean =>
	target === '/hiring' || target === '/hiring/my-tasks';

export const load: LayoutLoad = async ({ url }) => {
	if (!browser) return;

	hydrateSignupCaptcha();
	const onboarding = url.pathname.includes('/onboarding');
	const draft = onboarding ? readOnboardingDraft() : null;
	const token = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

	// If user is logged in and not in onboarding, redirect to dashboard
	if (token.value) {
		if (onboarding) {
			return { currentStep: draft?.step ?? 2 };
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
	} else if (onboarding) {
		const verified = get(isCaptchaVerified);
		const captchaSkipped = skipSignupCaptcha();
		if (
			shouldRedirectOnboardingToSignup({
				hasToken: false,
				verified,
				skipped: captchaSkipped,
				hasDraft: draft !== null
			})
		) {
			if (import.meta.env.DEV) {
				console.warn(
					'[E2E] Auth layout redirect: isCaptchaVerified=false, redirecting to /auth/signup'
				);
			}
			redirect(303, '/auth/signup');
		}
		if (import.meta.env.DEV) {
			if (captchaSkipped) console.log('[E2E] Auth layout: allowing onboarding (captcha skipped)');
			else console.log('[E2E] Auth layout: allowing onboarding (isCaptchaVerified=true)');
		}
		if (draft) return { currentStep: draft.step };
	}
};
