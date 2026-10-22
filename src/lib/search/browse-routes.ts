import { redirect } from '@sveltejs/kit';

export function redirectBrowseTasks(): never {
	redirect(307, '/tasks');
}

export function redirectBrowseServices(): never {
	redirect(307, '/services');
}
