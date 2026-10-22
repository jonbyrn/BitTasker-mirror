import { writable } from 'svelte/store';

export const isCaptchaVerified = writable(false);

/**
 * The Turnstile site key is registered for production hostnames.
 * Preview Workers hosts and rgb.bittasker.com fail that check, so the widget
 * reports a verification error. Production still requires the widget.
 */
export function captchaRequiredForHost(hostname: string): boolean {
	const host = hostname.trim().toLowerCase();
	if (!host || host === 'localhost' || host === '127.0.0.1') return false;
	if (host === 'rgb.bittasker.com' || host.endsWith('.workers.dev')) return false;
	if (host === 'bittasker.com' || host === 'www.bittasker.com') return true;
	return host.endsWith('.bittasker.com');
}

/** Local, preview, and rgb hosts do not call the production Turnstile service. */
export function skipSignupCaptcha(): boolean {
	if (import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true') return true;
	if (typeof location === 'undefined') return false;
	return !captchaRequiredForHost(location.hostname);
}
