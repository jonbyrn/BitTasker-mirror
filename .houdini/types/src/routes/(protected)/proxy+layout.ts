// @ts-nocheck
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { authState } from '$lib/stores/auth.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { tryCatch } from '$lib/utils/tryCatch';
import { user } from '$lib/stores/user.store';
import { pushNotificationService } from '$lib/api/services/push-notification.service';

export const load = async () => {
	// Only check authentication on the client side
	if (browser) {
		const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

		if (!token || token === null) {
			throw redirect(303, '/auth/login');
		} else {
			await tryCatch(user.getUserData());
			authState.login();
			await tryCatch(pushNotificationService.init());
		}
	}
};

// Disable SSR for protected routes in Capacitor
export const ssr = false;
;null as any as LayoutLoad;