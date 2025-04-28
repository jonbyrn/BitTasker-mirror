import { browser } from '$app/environment';
import { initializeStatusBar } from '$lib/utils/helpers/statusBar';

export const prerender = true;
export const ssr = false;
export const csr = true;

if (browser) {
  initializeStatusBar();
}
