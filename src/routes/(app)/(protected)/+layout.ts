import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect, isRedirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { authState } from '$lib/stores/auth.store';
import { isSessionEnding } from '$lib/stores/session-ending';
import { StorageKeys } from '$lib/utils/constants/storage';
import { getPendingDeepLink } from '$lib/utils/deep-link';

export const load: LayoutLoad = async ({ url }) => {
	if (!browser) return;

	try {
		const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

		// A logout in progress must not sign the page back in from a token a
		// refresh just wrote, and a missing token never reaches authState.login().
		if (!token || isSessionEnding()) {
			// Same guest check as the other protected routes: keep the page they asked
			// for, then send them to login. A pending internal deep link wins.
			const deepLink = getPendingDeepLink();
			const target = deepLink || url.pathname;
			const returnTo =
				target !== '/' && target !== '/auth/login' && !target.startsWith('/auth/')
					? `?returnTo=${encodeURIComponent(target)}`
					: '';
			redirect(303, `/auth/login${returnTo}`);
		}

		await authState.login();
	} catch (error) {
		if (isRedirect(error)) throw error;
		console.error(error);
	}
};

export const ssr = false;
