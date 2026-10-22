import { goto } from '$app/navigation';

/** Login URL that sends the visitor back to the listing they were booking. */
export function loginPath(returnTo: string): string {
	const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
	return `/auth/login?returnTo=${encodeURIComponent(safe)}`;
}

/** Path of the page on screen, including the query string. */
export function currentListingPath(): string {
	if (typeof window === 'undefined') return '/';
	return `${window.location.pathname}${window.location.search}`;
}

/**
 * Signed-out booking goes to login. Returns true when the caller must stop
 * and leave the payment drawer closed.
 */
export function redirectSignedOut(isAuthenticated: boolean, returnTo: string): boolean {
	if (isAuthenticated) return false;
	void goto(loginPath(returnTo));
	return true;
}
