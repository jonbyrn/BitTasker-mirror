import { browser } from '$app/environment';
import { StatusBarService } from '$lib/api/services/status-bar';

export const prerender = true;
export const ssr = false;
export const csr = true;

if (browser) {
  const statusBarService = StatusBarService.getInstance();
  statusBarService.initialize();
}
