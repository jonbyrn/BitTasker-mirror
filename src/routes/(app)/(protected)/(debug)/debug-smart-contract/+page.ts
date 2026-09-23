






/** @deprecated - EVM debug removed. Redirects to dashboard. */
import { redirect } from '@sveltejs/kit';

export function load() {
	redirect(307, '/hiring');
}
