import { writable } from 'svelte/store';

export const isCaptchaVerified = writable(false);

/**
 * The production Turnstile site key is registered for production hostnames.
 * rgb.bittasker.com and Workers preview hosts fail that check, so the widget
 * cannot complete there. Every other host still uses master's widget.
 */
export function isPreviewTurnstileHost(hostname: string): boolean {
	const host = hostname.trim().toLowerCase();
	return host === 'rgb.bittasker.com' || host.endsWith('.workers.dev');
}

export function captchaRequiredForHost(hostname: string): boolean {
	return !isPreviewTurnstileHost(hostname);
}

/**
 * False until a real browser hostname is known, and false on the preview hosts.
 * Signup uses this before it creates the Turnstile node or loads the script.
 */
export function shouldMountSignupTurnstile(hostname: string | null | undefined): boolean {
	if (import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true') return false;
	if (hostname == null || hostname.trim() === '') return false;
	return captchaRequiredForHost(hostname);
}

/** E2E and the two preview hosts skip the production Turnstile call. */
export function skipSignupCaptcha(): boolean {
	if (import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true') return true;
	if (typeof location === 'undefined') return false;
	return isPreviewTurnstileHost(location.hostname);
}
