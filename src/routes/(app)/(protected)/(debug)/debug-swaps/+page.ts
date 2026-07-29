import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';

export function load() {
	if (!dev) {
		redirect(307, '/hiring');
	}
}
