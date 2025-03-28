import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { getUserProfile } from '$lib/services/user.service';
import { user } from '$lib/stores/user.store';
import { authState } from '$lib/stores/auth.store';
import { StorageKeys } from '$lib/utils/constants/storage';

export const load: LayoutLoad = async () => {
  // Only check authentication on the client side
  if (browser) {
    const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

    if (token) {
      const res = await getUserProfile();
      user.set(res);
      authState.login();
      return { user: res };
    } else {
      throw redirect(303, '/auth');
    }
  }

  return {};
};

// Disable SSR for protected routes in Capacitor
export const ssr = false;