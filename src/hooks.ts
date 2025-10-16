import type { HandleClientError } from '@sveltejs/kit';

/* { error, event, status, message } */
export const handleError: HandleClientError = async ({ error, event, status, message }) => {
	return {
		message: 'Whoops! An error occurred',
	};
};