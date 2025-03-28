import type { LayoutLoad } from '../$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { tryCatch } from '$lib/utils/tryCatch';
import { getUserProfile } from '$lib/services/user.service';
import { user } from '$lib/stores/user.store';
import { authState } from '$lib/stores/auth.store';
import { Preferences } from '@capacitor/preferences';

export const load: LayoutLoad = async () => {
	if (browser) {
		const { data: token, error: tokenError } = await tryCatch(
			Preferences.get({ key: 'access_token' })
		);
		if (tokenError || !token || token === null) {
			throw redirect(303, '/auth');
		}

		const { data: userData, error: userDataError } = await tryCatch(getUserProfile());
		if (userDataError) throw redirect(303, '/auth');

		user.set(userData);
		authState.login();

		return { user: userData };
	}

	return {};
};
