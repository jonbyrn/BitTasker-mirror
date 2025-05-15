import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = async ({ error, event, status, message }) => {
    console.log('error', error);
	return {
		message: 'Whoops! An error occurred',
	};
};