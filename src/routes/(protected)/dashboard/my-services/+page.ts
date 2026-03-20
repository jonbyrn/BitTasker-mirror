import { redirect } from '@sveltejs/kit';

export function load() {
	throw redirect(302, '/services/manage?tab=listings');
}
