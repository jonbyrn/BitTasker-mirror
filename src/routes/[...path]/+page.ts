import { error } from '@sveltejs/kit';

/** A URL with no page of its own is missing. It is not a server failure. */
export function load(): never {
	error(404, 'Not Found');
}
