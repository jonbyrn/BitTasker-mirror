// TODO: This layout should be removed, and the onboarding logic should be handled in the (protected)/+layout.ts file
import type { LayoutLoad } from '../../$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { tryCatch } from '$lib/utils/tryCatch';
import { authState } from '$lib/stores/auth.store';
import { load_IsOnboardingComplete } from '$houdini';

export const load: LayoutLoad = async (event) => {
	if (browser) {
		const { data: userData, error: userDataError } = await tryCatch(
			(await load_IsOnboardingComplete(event)).IsOnboardingComplete.fetch()
		);
		
		if (userDataError) {
			console.log('User data error, redirecting to auth');
			throw redirect(303, '/auth/login');
		}

		authState.login();
		
		if (userData.data?.me.onboardingComplete) {
			throw redirect(303, '/dashboard');
		}
	}
};
