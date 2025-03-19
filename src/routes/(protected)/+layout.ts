import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { getToken } from '$lib/stores/auth';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
  // Only check authentication on the client side
  if (browser) {
    // Wait for token check
    const token = await getToken();
    
    if (!token) {
      throw redirect(303, '/auth');
    }
  }
  
  return {};
};

// Disable SSR for protected routes in Capacitor
export const ssr = false;