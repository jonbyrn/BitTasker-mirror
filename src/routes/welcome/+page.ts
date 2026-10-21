import { redirect } from '@sveltejs/kit';

/** /welcome has no page of its own. Send people to the homepage. */
export function load() {
	redirect(307, '/');
}
