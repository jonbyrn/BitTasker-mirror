import { redirect } from '@sveltejs/kit';

/** /onboarding is the public alias of the account setup flow. */
export function load() {
	redirect(307, '/auth/onboarding');
}
