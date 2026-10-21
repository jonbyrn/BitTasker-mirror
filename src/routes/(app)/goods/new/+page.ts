import { redirect } from '@sveltejs/kit';

/** Old sell links land on the Buy & Sell form. */
export function load() {
	redirect(307, '/browse/goods/new');
}
