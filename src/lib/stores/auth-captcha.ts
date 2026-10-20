import { writable } from 'svelte/store';

export const isCaptchaVerified = writable(false);

/** Local and Playwright runs do not call the production Turnstile service. */
export function skipSignupCaptcha(): boolean {
	if (import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true') return true;
	if (typeof location === 'undefined') return false;
	const host = location.hostname;
	return host === 'localhost' || host === '127.0.0.1';
}
