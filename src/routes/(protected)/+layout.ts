import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { getUserProfile } from '$lib/services/auth.service';
import { Preferences } from '@capacitor/preferences';

export const load: LayoutLoad = async () => {
  // Only check authentication on the client side
  if (browser) {
    const { value: token } = await Preferences.get({ key: 'access_token' });

    if (token) {
      const user = await getUserProfile(token);
      return { user };
    } else {
      throw redirect(303, '/auth');
    }
  }

  return {};
};

// Disable SSR for protected routes in Capacitor
export const ssr = false;